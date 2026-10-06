import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MenuButton, type MenuItem } from "@/components/ui/MenuButton";
import { CloseIcon, GearIcon } from "@/components/ui/icons";
import { noticeTime, useAutoDismiss } from "@/components/ui/use-auto-dismiss";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";

/** An entry of the menu: the action posted to the queue, and its group. */
export interface ActionEntry {
  action: string;
  /** Separator line before this entry, to mark a group. */
  separatorBefore?: boolean;
  /**
   * The submenu the entry goes in, labelled `<prefix>.groups.<group>`: the entries
   * of a group follow each other in it, the submenu standing where its first entry
   * is in the list.
   */
  group?: string;
}

/**
 * An entry of the "Data actions" submenu: a change made on the collector's own
 * records, at once, rather than an action queued for the agent. Labels and texts
 * come from `<prefix>.data.<key>.label`, `.question`, `.confirm`, `.running` and
 * `.done`.
 */
export interface DataActionEntry {
  key: string;
  /**
   * Privileges any of which lets the user see the entry, a Manager holding them
   * all. The menu follows the effective privileges, impersonation included; the API
   * still checks each object.
   */
  privileges: readonly string[];
  /** Runs the action on one object; returns the API error message, or null. */
  run: (target: ActionTarget) => Promise<string | null>;
  /** Called with the objects the action succeeded on. */
  onDone?: (done: ActionTarget[]) => void;
}

/** Names listed in a data action question; the others are counted. */
const NAMES_SHOWN = 10;

/** Object to queue the action on: its id, and its name for refusal messages. */
export interface ActionTarget {
  id: string;
  name: string;
}

interface Outcome {
  /** The success message, or null when nothing succeeded. */
  done: string | null;
  failures: string[];
}

/** The action awaiting confirmation: an agent action, or a data action. */
type Pending = { kind: "queue"; action: string } | { kind: "data"; entry: DataActionEntry };

/**
 * Agent actions menu for one or several objects (nodes, services, instances).
 * The chosen action is confirmed then posted to the collector queue, from which the
 * agent takes it: nothing runs during the request, so the menu announces a queuing
 * and not a result.
 *
 * Rights are checked by the API for each object: NodeExec privilege and
 * responsibility. In a multiple selection, a refusal applies to its object only and
 * the report names it.
 *
 * Labels come from `<prefix>.items.<action>`, and the menu texts from
 * `<prefix>.open`, `.question`, `.confirm`, `.queueing`, `.queued` and `.failure`:
 * each kind of object keeps its own wording.
 *
 * The report of an action (what was queued or done, and what was refused) leaves
 * by itself after the time to read it, by its length and longer when something
 * failed; it waits while hovered or focused, and its close button removes it.
 *
 * The data actions, last in their own submenu as in the historical collector, act
 * on the collector at once and cannot be undone: their confirmation names the
 * objects and its button says what it does. An entry the user's privileges do not
 * allow is not shown, nor the submenu when none is left.
 */
export function ActionsMenu({
  targets,
  actions,
  prefix,
  queue: queueOne,
  dataActions = [],
  onCompare,
}: {
  targets: ActionTarget[];
  actions: readonly ActionEntry[];
  /** Prefix of the translation keys, for example `nodes.actions`. */
  prefix: string;
  /** Queues the action on one object; returns the API error message, or null. */
  queue: (target: ActionTarget, action: string) => Promise<string | null>;
  dataActions?: readonly DataActionEntry[];
  /**
   * Opens the comparison of the targets: offered from two of them, apart from the
   * actions, which change something, as it only reads.
   */
  onCompare?: () => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Pending | null>(null);
  // Each report numbered: a new one starts its time again.
  const [outcome, setOutcomeState] = useState<(Outcome & { id: number }) | null>(null);
  function setOutcome(next: Outcome | null) {
    setOutcomeState((previous) =>
      next === null ? null : { ...next, id: (previous?.id ?? 0) + 1 },
    );
  }
  // The report leaves after the time to read it, longer when something failed;
  // hovered or focused, it waits.
  const reportText = outcome === null ? "" : [outcome.done ?? "", ...outcome.failures].join(" ");
  const dismissal = useAutoDismiss(
    outcome?.id ?? null,
    noticeTime(reportText, outcome !== null && outcome.failures.length > 0),
    () => {
      setOutcome(null);
    },
  );
  const privileges = useEffectivePrivileges();

  const failureText = (target: ActionTarget, message: string | null) =>
    t(`${prefix}.failure`, { name: target.name, message });

  const queue = useMutation({
    mutationFn: async (action: string): Promise<Outcome> => {
      const results = await Promise.all(
        targets.map(async (target) => ({ target, message: await queueOne(target, action) })),
      );
      const failures = results
        .filter((result) => result.message !== null)
        .map((result) => failureText(result.target, result.message));
      const queued = results.length - failures.length;
      return {
        done:
          queued === 0
            ? null
            : t(`${prefix}.queued`, { action: t(`${prefix}.items.${action}`), count: queued }),
        failures,
      };
    },
    onSuccess: (result) => {
      setOutcome(result);
    },
  });

  const data = useMutation({
    mutationFn: async (entry: DataActionEntry): Promise<Outcome> => {
      // One object after the other: each is a transaction on the collector side,
      // and a long selection must not open them all at once.
      const done: ActionTarget[] = [];
      const failures: string[] = [];
      for (const target of targets) {
        const message = await entry.run(target);
        if (message === null) done.push(target);
        else failures.push(failureText(target, message));
      }
      entry.onDone?.(done);
      return {
        done:
          done.length === 0 ? null : t(`${prefix}.data.${entry.key}.done`, { count: done.length }),
        failures,
      };
    },
    onSuccess: (result) => {
      setOutcome(result);
    },
  });

  // Without targets, only the report of the last action stays: a deletion unticks
  // the objects it removed.
  if (targets.length === 0 && outcome === null) return null;
  const busy = queue.isPending || data.isPending;

  const itemOf = (entry: ActionEntry): MenuItem => ({
    key: entry.action,
    label: t(`${prefix}.items.${entry.action}`),
    separatorBefore: entry.separatorBefore === true,
    disabled: busy,
    onSelect: () => {
      setOutcome(null);
      setPending({ kind: "queue", action: entry.action });
    },
  });
  const items: MenuItem[] = [];
  const submenus = new Map<string, MenuItem>();
  for (const entry of actions) {
    if (entry.group === undefined) {
      items.push(itemOf(entry));
      continue;
    }
    let submenu = submenus.get(entry.group);
    if (submenu === undefined) {
      submenu = {
        key: `group:${entry.group}`,
        label: t(`${prefix}.groups.${entry.group}`),
        separatorBefore: entry.separatorBefore === true,
        items: [],
      };
      submenus.set(entry.group, submenu);
      items.push(submenu);
    }
    submenu.items?.push({ ...itemOf(entry), separatorBefore: false });
  }

  if (onCompare !== undefined && targets.length >= 2)
    items.push({
      key: "compare",
      label: t("actionsMenu.compare"),
      separatorBefore: true,
      disabled: busy,
      onSelect: onCompare,
    });

  // Shown once the privileges are known: an entry must not appear then vanish.
  const allowed = dataActions.filter(
    (entry) => privileges.data !== undefined && hasPrivilege(privileges.data, entry.privileges),
  );
  if (allowed.length > 0)
    items.push({
      key: "group:data",
      label: t("actionsMenu.dataActions"),
      separatorBefore: true,
      items: allowed.map((entry) => ({
        key: `data:${entry.key}`,
        label: t(`${prefix}.data.${entry.key}.label`),
        disabled: busy,
        onSelect: () => {
          setOutcome(null);
          setPending({ kind: "data", entry });
        },
      })),
    });

  const label =
    pending === null || pending.kind !== "queue" ? "" : t(`${prefix}.items.${pending.action}`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {targets.length > 0 && (
        <MenuButton
          label={t(`${prefix}.open`)}
          items={items}
          disabled={busy}
          // What a selection is made for: it stands out, with the gear of the
          // historical actions (`action16`).
          prominent
          icon={<GearIcon className="h-3.5 w-3.5" />}
        />
      )}

      {pending !== null && pending.kind === "data" && (
        <DataConfirm
          question={t(`${prefix}.data.${pending.entry.key}.question`, { count: targets.length })}
          names={targets.map((target) => target.name)}
          confirmLabel={
            data.isPending
              ? t(`${prefix}.data.${pending.entry.key}.running`)
              : t(`${prefix}.data.${pending.entry.key}.confirm`, { count: targets.length })
          }
          busy={data.isPending}
          onConfirm={() => {
            data.mutate(pending.entry, {
              onSettled: () => {
                setPending(null);
              },
            });
          }}
          onCancel={() => {
            setPending(null);
          }}
        />
      )}

      {pending !== null && pending.kind === "queue" && (
        <div
          role="group"
          aria-label={t(`${prefix}.question`, { action: label, count: targets.length })}
          className="flex flex-wrap items-center gap-2"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setPending(null);
            }
          }}
        >
          <p>{t(`${prefix}.question`, { action: label, count: targets.length })}</p>
          <button
            type="button"
            autoFocus
            disabled={queue.isPending}
            onClick={() => {
              queue.mutate(pending.action, {
                onSettled: () => {
                  setPending(null);
                },
              });
            }}
            className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
          >
            {queue.isPending ? t(`${prefix}.queueing`) : t(`${prefix}.confirm`)}
          </button>
          <button
            type="button"
            onClick={() => {
              setPending(null);
            }}
            className="h-7 rounded-(--radius-control) border border-line px-3"
          >
            {t("detail.cancel")}
          </button>
        </div>
      )}

      {outcome !== null && (
        <div
          {...dismissal.handlers}
          className={`flex items-start gap-2 transition-opacity duration-400 motion-reduce:transition-none ${dismissal.leaving ? "opacity-0" : "opacity-100"}`}
        >
          <div className="flex flex-col gap-1">
            {outcome.done !== null && (
              <span role="status" className="text-ink-muted">
                {outcome.done}
              </span>
            )}
            {outcome.failures.length > 0 && (
              <ul role="alert" className="text-state-down">
                {outcome.failures.map((failure) => (
                  <li key={failure}>■ {failure}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOutcome(null);
            }}
            aria-label={t("actionsMenu.dismiss")}
            title={t("actionsMenu.dismiss")}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-(--radius-control) text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The confirmation of a data action: the question, the objects it acts on by name,
 * and a button saying what it does. Cancel takes the focus; Escape or Cancel leave
 * everything as it was.
 */
function DataConfirm({
  question,
  names,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  question: string;
  names: string[];
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const shown = names.slice(0, NAMES_SHOWN);
  const more = names.length - shown.length;
  return (
    <div
      role="alertdialog"
      aria-label={question}
      className="flex w-full flex-col items-start gap-2 rounded-(--radius-control) border border-state-down bg-state-down-soft p-3"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <p className="font-medium">
        <span aria-hidden="true" className="text-state-down">
          ▲{" "}
        </span>
        {question}
      </p>
      <ul className="flex flex-wrap gap-1">
        {shown.map((name, index) => (
          <li
            key={`${name}-${String(index)}`}
            className="rounded-(--radius-control) border border-line bg-surface px-1.5 text-data"
          >
            {name}
          </li>
        ))}
        {more > 0 && <li className="text-ink-muted">{t("actionsMenu.more", { count: more })}</li>}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="h-7 rounded-(--radius-control) bg-state-down px-3 font-medium text-surface-raised disabled:opacity-60"
        >
          {confirmLabel}
        </button>
        {/* The focus waits on Cancel: an Enter pressed out of habit deletes nothing. */}
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={onCancel}
          className="h-7 rounded-(--radius-control) border border-line bg-surface px-3"
        >
          {t("detail.cancel")}
        </button>
      </div>
    </div>
  );
}
