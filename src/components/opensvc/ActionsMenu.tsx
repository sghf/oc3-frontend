import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { MenuButton, type MenuItem } from "@/components/ui/MenuButton";
import { CloseIcon, GearIcon } from "@/components/ui/icons";
import { NOTICE_CARD, NOTICE_TONES, type NoticeTone } from "@/components/ui/notice-tones";
import { InNoticeRegion } from "@/components/ui/NoticeRegion";
import { nextNoticeId, noticeTime, useAutoDismiss } from "@/components/ui/use-auto-dismiss";
import { queueActionList, type ActionEnqueue } from "@/lib/api/action-queue";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";

/**
 * An entry of the menu: the action posted to the queue, and its group. Its label is
 * `<prefix>.items.<action>`, the full name of the action, which the confirmation and
 * the reports use too; `<prefix>.menu.<action>`, when given, is a shorter label for
 * the menu alone, where the submenu's name already says the rest.
 */
export interface ActionEntry {
  action: string;
  /**
   * Separator line before this entry. On the first entry of a group, before its
   * submenu; on another entry of a group, before it within the submenu.
   */
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
 * `.done`; with a choice, `.choice` names its field, and `.done` receives the
 * label chosen as `choice`, and the values entered in its fields, by their key.
 */
export interface DataActionEntry {
  key: string;
  /**
   * Privileges any of which lets the user see the entry, a Manager holding them
   * all; none, every user. The menu follows the effective privileges, impersonation
   * included; the API still checks each object.
   */
  privileges: readonly string[];
  /**
   * "destructive", the default, for what cannot be undone: a red confirmation, the
   * focus on Cancel. "change" for what the opposite entry undoes, such as attaching
   * a tag or turning the notifications on: a plain confirmation.
   */
  tone?: "destructive" | "change";
  /** Separator line before this entry in the submenu. */
  separatorBefore?: boolean;
  /** Something to choose in the confirmation, applied to every object: a tag, a moduleset… */
  choice?: DataActionChoice;
  /**
   * Integers to enter in the confirmation, applied to every object, such as
   * thresholds: their keys, labelled `<prefix>.data.<key>.fields.<field>`. One of
   * them at least is required; a field left empty is not passed.
   */
  fields?: readonly string[];
  /**
   * A free text to enter in the confirmation, applied to every object, such as
   * the reason of an acknowledgement, labelled `<prefix>.data.<key>.comment`;
   * optional.
   */
  comment?: boolean;
  /**
   * Read when the confirmation opens: what the action would also break, such as
   * the filtersets using a filter to delete. The confirmation waits for them.
   */
  warnings?: (targets: ActionTarget[]) => Promise<string[]>;
  /**
   * Runs the action on one object, with the value chosen when the entry has a
   * choice; returns the API error message, or null. An entry has `run` or `runAll`.
   */
  run?: (
    target: ActionTarget,
    choice: string | undefined,
    values: Readonly<Record<string, number>>,
    comment: string,
  ) => Promise<string | null>;
  /**
   * Runs the action on every object at once, in place of `run` one object after
   * the other: for a batch the collector applies itself. Returns the objects it
   * was done for, which the report counts, and the failures, each naming its
   * object; a rejection is a failure of the whole batch.
   */
  runAll?: (
    targets: ActionTarget[],
    choice: ComboboxOption | undefined,
  ) => Promise<{ done: ActionTarget[]; failures: string[] }>;
  /** Called with the objects the action succeeded on. */
  onDone?: (done: ActionTarget[]) => void;
}

/** The options a data action offers to choose from, loaded when its confirmation opens. */
export interface DataActionChoice {
  /** Cache key of the options, shared by the menus offering the same ones. */
  queryKey: readonly unknown[];
  load: () => Promise<ComboboxOption[]>;
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

/** The tint of a report: done, failed, or both at once, which a warning says. */
function outcomeTone(outcome: Outcome): NoticeTone {
  if (outcome.failures.length === 0) return "success";
  return outcome.done === null ? "error" : "warning";
}

/** The confirmation in a header: a card anchored under the button, over the panel. */
const CONFIRM_CARD =
  "absolute top-full left-0 z-30 mt-2 flex w-max max-w-[min(32rem,calc(100vw-2rem))] flex-wrap items-center gap-2 rounded-(--radius-panel) border border-line bg-surface-raised p-3 shadow-lg";

/** The queue of a menu without agent actions, never called. */
const noQueue = (): Promise<string | null> => Promise.resolve(null);

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
 *
 * The confirmation opens as a card anchored under the button, over what follows:
 * the row of the button keeps its height and the button its place, in a list
 * toolbar as in a panel header.
 */
export function ActionsMenu({
  targets,
  actions = [],
  prefix,
  queue: queueOne = noQueue,
  enqueue,
  dataActions = [],
  onCompare,
}: {
  targets: ActionTarget[];
  /** Agent actions; none for an object the agents do not act on, such as an alert. */
  actions?: readonly ActionEntry[];
  /** Prefix of the translation keys, for example `nodes.actions`. */
  prefix: string;
  /** Queues the action on one object; returns the API error message, or null. */
  queue?: (target: ActionTarget, action: string) => Promise<string | null>;
  /**
   * The entry of `PUT /actions` acting on one object, or why there is none; in
   * place of `queue`, the whole selection is then queued by lists
   * (`queueActionList`), a few requests rather than one per object.
   */
  enqueue?: (target: ActionTarget, action: string) => ActionEnqueue | string;
  dataActions?: readonly DataActionEntry[];
  /**
   * Opens the comparison of the targets: offered from two of them, apart from the
   * actions, which change something, as it only reads.
   */
  onCompare?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState<Pending | null>(null);
  // Each report numbered, never twice: a new one starts its time again.
  const [outcome, setOutcomeState] = useState<(Outcome & { id: number }) | null>(null);
  function setOutcome(next: Outcome | null) {
    setOutcomeState(next === null ? null : { ...next, id: nextNoticeId() });
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
      const results =
        enqueue === undefined
          ? await Promise.all(
              targets.map(async (target) => ({ target, message: await queueOne(target, action) })),
            )
          : (await queueActionList(targets.map((target) => enqueue(target, action)))).map(
              (message, index) => ({ target: targets[index] as ActionTarget, message }),
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
    mutationFn: async ({
      entry,
      choice,
      values,
      comment,
    }: {
      entry: DataActionEntry;
      choice: ComboboxOption | undefined;
      values: Record<string, number>;
      comment: string;
    }): Promise<Outcome> => {
      const done: ActionTarget[] = [];
      const failures: string[] = [];
      if (entry.runAll !== undefined) {
        const result = await entry.runAll(targets, choice);
        done.push(...result.done);
        failures.push(...result.failures);
      } else if (entry.run !== undefined) {
        // One object after the other: each is a transaction on the collector side,
        // and a long selection must not open them all at once.
        for (const target of targets) {
          const message = await entry.run(target, choice?.value, values, comment);
          if (message === null) done.push(target);
          else failures.push(failureText(target, message));
        }
      }
      entry.onDone?.(done);
      return {
        done:
          done.length === 0
            ? null
            : t(`${prefix}.data.${entry.key}.done`, {
                count: done.length,
                choice: choice?.label,
                ...values,
              }),
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
    label: i18n.exists(`${prefix}.menu.${entry.action}`)
      ? t(`${prefix}.menu.${entry.action}`)
      : t(`${prefix}.items.${entry.action}`),
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
      submenu.items?.push({ ...itemOf(entry), separatorBefore: false });
      continue;
    }
    submenu.items?.push(itemOf(entry));
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
      items: allowed.map((entry, index) => ({
        key: `data:${entry.key}`,
        label: t(`${prefix}.data.${entry.key}.label`),
        separatorBefore: index > 0 && entry.separatorBefore === true,
        disabled: busy,
        onSelect: () => {
          setOutcome(null);
          setPending({ kind: "data", entry });
        },
      })),
    });

  // Nothing the user may do here, or not known yet: no menu, rather than an empty one.
  if (items.length === 0 && pending === null && outcome === null) return null;

  const label =
    pending === null || pending.kind !== "queue" ? "" : t(`${prefix}.items.${pending.action}`);

  return (
    <div className={"relative flex items-center"}>
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

      {pending !== null && (
        <div className={CONFIRM_CARD}>
          {pending !== null && pending.kind === "data" && (
            <DataConfirm
              entry={pending.entry}
              prefix={prefix}
              targets={targets}
              question={t(`${prefix}.data.${pending.entry.key}.question`, {
                count: targets.length,
              })}
              confirmLabel={
                data.isPending
                  ? t(`${prefix}.data.${pending.entry.key}.running`)
                  : t(`${prefix}.data.${pending.entry.key}.confirm`, { count: targets.length })
              }
              busy={data.isPending}
              onConfirm={(choice, values, comment) => {
                data.mutate(
                  { entry: pending.entry, choice, values, comment },
                  {
                    onSettled: () => {
                      setPending(null);
                    },
                  },
                );
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
        </div>
      )}

      {outcome !== null && (
        <InNoticeRegion>
          <div
            {...dismissal.handlers}
            className={`${NOTICE_CARD} ${NOTICE_TONES[outcomeTone(outcome)].box} transition-opacity duration-400 motion-reduce:transition-none ${dismissal.leaving ? "opacity-0" : "opacity-100"}`}
          >
            <div className="flex flex-col gap-1">
              {outcome.done !== null && (
                <span role="status">
                  <span aria-hidden="true" className={NOTICE_TONES.success.markClass}>
                    {NOTICE_TONES.success.mark}{" "}
                  </span>
                  {outcome.done}
                </span>
              )}
              {outcome.failures.length > 0 && (
                <ul role="alert">
                  {outcome.failures.map((failure) => (
                    <li key={failure}>
                      <span aria-hidden="true" className={NOTICE_TONES.error.markClass}>
                        {NOTICE_TONES.error.mark}{" "}
                      </span>
                      {failure}
                    </li>
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
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-(--radius-control) text-ink-muted hover:bg-surface hover:text-ink"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>
        </InNoticeRegion>
      )}
    </div>
  );
}

/** The confirmation's frame, by the tone of the action. */
const CONFIRM_TONES = {
  destructive: {
    box: "border-state-down bg-state-down-soft",
    mark: <span className="text-state-down">▲ </span>,
    button: "bg-state-down text-surface-raised",
  },
  change: {
    box: "border-line bg-surface-raised",
    mark: null,
    button: "bg-accent text-accent-ink",
  },
} as const;

/**
 * The confirmation of a data action: the question, the objects it acts on by name,
 * what else it would break, what to choose when the action needs it, and a button
 * saying what it does. A destructive action leaves the focus on Cancel, so that an
 * Enter pressed out of habit changes nothing; a choice takes the focus, the button
 * waiting for it. Escape or Cancel leave everything as it was.
 */
function DataConfirm({
  entry,
  prefix,
  targets,
  question,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  entry: DataActionEntry;
  prefix: string;
  targets: ActionTarget[];
  question: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: (
    choice: ComboboxOption | undefined,
    values: Record<string, number>,
    comment: string,
  ) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const tone = CONFIRM_TONES[entry.tone ?? "destructive"];
  const [chosen, setChosen] = useState("");
  const [typed, setTyped] = useState<Record<string, string>>({});
  const firstField = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState("");
  const commentField = useRef<HTMLTextAreaElement>(null);
  // What the action would also remove, acknowledged: required once the warnings
  // say something, or could not be read.
  const [acknowledged, setAcknowledged] = useState(false);
  const choiceInput = useRef<HTMLInputElement>(null);
  const options = useQuery({
    queryKey: ["actionsMenu", "choice", ...(entry.choice?.queryKey ?? [])],
    enabled: entry.choice !== undefined,
    queryFn: entry.choice?.load ?? (() => Promise.resolve([])),
  });
  const warnings = useQuery({
    queryKey: ["actionsMenu", "warnings", prefix, entry.key, targets.map((target) => target.id)],
    enabled: entry.warnings !== undefined,
    // Read again at each opening: what uses an object changes.
    gcTime: 0,
    queryFn: () => entry.warnings?.(targets) ?? Promise.resolve([]),
  });
  useEffect(() => {
    if (entry.choice !== undefined) choiceInput.current?.focus();
    else if (entry.fields !== undefined) firstField.current?.focus();
    else if (entry.comment === true) commentField.current?.focus();
  }, [entry.choice, entry.fields, entry.comment]);

  // The values entered: integers, the empty fields left out.
  const values: Record<string, number> = {};
  let invalidField = false;
  for (const field of entry.fields ?? []) {
    const text = (typed[field] ?? "").trim();
    if (text === "") continue;
    if (/^-?\d+$/.test(text)) values[field] = Number(text);
    else invalidField = true;
  }
  const missingValue = entry.fields !== undefined && Object.keys(values).length === 0;

  const choice = options.data?.find((option) => option.value === chosen);
  const mustAcknowledge =
    entry.warnings !== undefined &&
    (warnings.isError || (warnings.data !== undefined && warnings.data.length > 0));
  const waiting =
    (entry.choice !== undefined && choice === undefined) ||
    (entry.warnings !== undefined && warnings.isPending) ||
    (mustAcknowledge && !acknowledged) ||
    invalidField ||
    missingValue;
  const names = targets.map((target) => target.name);
  const shown = names.slice(0, NAMES_SHOWN);
  const more = names.length - shown.length;
  return (
    <div
      role="alertdialog"
      aria-label={question}
      className={`flex w-full flex-col items-start gap-2 rounded-(--radius-control) border p-3 ${tone.box}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <p className="font-medium">
        {tone.mark !== null && <span aria-hidden="true">{tone.mark}</span>}
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
      {entry.choice !== undefined && options.isError && (
        <p role="alert" className="text-state-down">
          ■ {options.error.message}
        </p>
      )}
      {entry.warnings !== undefined &&
        (warnings.isPending ? (
          <p className="text-ink-muted">{t("actionsMenu.checking")}</p>
        ) : warnings.isError ? (
          <p role="alert" className="text-state-down">
            ■ {warnings.error.message}
          </p>
        ) : (
          warnings.data.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {warnings.data.map((warning) => (
                <li key={warning}>
                  <span aria-hidden="true" className="text-state-warn">
                    ▲{" "}
                  </span>
                  {warning}
                </li>
              ))}
            </ul>
          )
        ))}
      {mustAcknowledge && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => {
              setAcknowledged(event.target.checked);
            }}
          />
          {warnings.isError
            ? t("usage.acknowledgeUnknown")
            : t("actionsMenu.acknowledge", { count: warnings.data?.length ?? 0 })}
        </label>
      )}
      {entry.comment === true && (
        <label className="flex w-full flex-col gap-1">
          {t(`${prefix}.data.${entry.key}.comment`)}
          <textarea
            ref={commentField}
            value={comment}
            rows={3}
            onChange={(event) => {
              setComment(event.target.value);
            }}
            className="w-full min-w-72 rounded-(--radius-control) border border-line bg-surface px-2 py-1"
          />
        </label>
      )}
      {/* The field of a choice on the row of the buttons: its list opens under them,
          over nothing the confirmation needs. */}
      <div className="flex flex-wrap items-center gap-2">
        {entry.fields?.map((field, index) => (
          <label key={field} className="flex items-center gap-1.5">
            {t(`${prefix}.data.${entry.key}.fields.${field}`)}
            <input
              ref={index === 0 ? firstField : undefined}
              inputMode="numeric"
              value={typed[field] ?? ""}
              aria-invalid={(typed[field] ?? "").trim() !== "" && !(field in values)}
              onChange={(event) => {
                setTyped((previous) => ({ ...previous, [field]: event.target.value }));
              }}
              className="h-7 w-24 rounded-(--radius-control) border border-line bg-surface px-2 font-mono aria-invalid:border-state-down"
            />
          </label>
        ))}
        {entry.choice !== undefined && !options.isError && (
          <Combobox
            options={options.data ?? []}
            value={chosen}
            onChange={setChosen}
            label={t(`${prefix}.data.${entry.key}.choice`)}
            placeholder={
              options.isPending
                ? t("actionsMenu.choiceLoading")
                : t(`${prefix}.data.${entry.key}.choice`)
            }
            emptyText={t("actionsMenu.choiceNone")}
            inputRef={choiceInput}
            className="w-72 max-w-full"
          />
        )}
        <button
          type="button"
          autoFocus={
            entry.tone === "change" &&
            entry.choice === undefined &&
            entry.fields === undefined &&
            entry.comment !== true
          }
          disabled={busy || waiting}
          onClick={() => {
            onConfirm(choice, values, comment.trim());
          }}
          className={`h-7 rounded-(--radius-control) px-3 font-medium disabled:opacity-60 ${tone.button}`}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          autoFocus={
            entry.tone !== "change" &&
            entry.choice === undefined &&
            entry.fields === undefined &&
            entry.comment !== true
          }
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
