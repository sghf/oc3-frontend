import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18n from "@/i18n";
import { noticeTime, useAutoDismiss } from "@/components/ui/use-auto-dismiss";
import { NOTICE_TONES } from "@/components/ui/notice-tones";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { TransientNotice } from "@/components/ui/TransientNotice";
import { ChevronDownIcon, CloseIcon, HistoryIcon, ResetIcon } from "@/components/ui/icons";
import { useFormUser } from "@/features/forms/use-form-user";
import type { RecordedVersion } from "./commit";
import { useDesigner, type Notice } from "./designer-context";
import { DragHint, DragProvider } from "./dnd";
import { ModulesetEditor } from "./ModulesetEditor";
import type { LogLine, ObjectKind, Operation } from "./model";
import { Navigator } from "./Navigator";
import { RulesetEditor } from "./RulesetEditor";
import { DesignerProvider } from "./store";
import { FiltersetView } from "./FiltersetView";
import { GroupView } from "./GroupView";
import { BUTTON, OpenHistoryContext, SelectContext, type Selection } from "./ui";
import { HistoryPanel } from "./HistoryPanel";
import type { HistoryObject } from "./use-compliance-history";
import { useDesignerDraft } from "./use-designer-data";

type CopyVariable = Extract<Operation, { op: "copyVariable" }>;

/** "ruleset:12" in the URL: the object shown in the editor. */
function parseSel(sel: string | undefined): Selection | null {
  const m = /^(ruleset|moduleset|filterset|group):(-?\d+)$/.exec(sel ?? "");
  if (m === null) return null;
  const kind =
    m[1] === "ruleset"
      ? "ruleset"
      : m[1] === "moduleset"
        ? "moduleset"
        : m[1] === "filterset"
          ? "filterset"
          : "group";
  return { kind, id: Number(m[2]) };
}

/**
 * The compliance designer: the rulesets and modulesets, their content, relations
 * and teams, shaped by pickers or by drag and drop, in a sandbox: the changes
 * stay in the browser tab until committed, then are saved to the collector, and
 * the designer starts again from what the collector holds.
 */
export function DesignerPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const draft = useDesignerDraft();
  const user = useFormUser();
  // The changes the last complete commit saved, told once the designer is read again.
  const [committed, setCommitted] = useState<{
    at: number;
    count: number;
    version: RecordedVersion | undefined;
  } | null>(null);
  // The object open when the commit started, found again by name in the new
  // sandbox: one the sandbox created had a temporary id, the collector gave another.
  const [reselect, setReselect] = useState<Reselect | null>(null);
  // The sandbox in use: it starts again, from the collector's data, only after a
  // commit saved everything. The live updates read the data again in the
  // background without touching the pending changes.
  const [generation, setGeneration] = useState(0);
  // The compliance history, open on everything or on one object; closed when null.
  const [history, setHistory] = useState<{ object: HistoryObject | null } | null>(null);
  return (
    <section className="flex h-[calc(100dvh-2.75rem-2rem)] flex-col gap-3">
      <div className="flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="designer" className="h-5 w-5" />
          {t("designer.title")}
        </h1>
        <button
          type="button"
          aria-expanded={history !== null}
          // Beside the title, as the actions of the other pages: the right edge is
          // where the anchor reopening the last panel floats (`PanelAnchor`).
          className={BUTTON}
          onClick={() => {
            setHistory(history === null ? { object: null } : null);
          }}
        >
          <HistoryIcon className="h-3.5 w-3.5" />
          {t("designer.historyPanel.open")}
        </button>
      </div>
      {draft.isPending ? (
        <p className="text-ink-muted">{t("designer.loading")}</p>
      ) : draft.isError ? (
        <p className="text-state-down">■ {draft.error.message}</p>
      ) : (
        <DesignerProvider
          key={generation}
          original={draft.data}
          author={user.data?.name.trim() ?? ""}
          onCommitted={(count, version) => {
            // The collector's data read again, then a new sandbox starts from it.
            void queryClient.refetchQueries({ queryKey: ["designer", "exports"] }).then(() => {
              setCommitted({ at: Date.now(), count, version });
              setGeneration((g) => g + 1);
            });
            // Everything else shown from the collector may have changed too.
            void queryClient.invalidateQueries({
              predicate: (query) => query.queryKey[0] !== "designer",
            });
          }}
        >
          <DragProvider>
            <Workspace
              history={history}
              onHistory={setHistory}
              generation={generation}
              reselect={reselect}
              onCommitStart={(open) => {
                setReselect(open === null ? null : { ...open, from: generation });
              }}
              onReselected={() => {
                setReselect(null);
              }}
            />
          </DragProvider>
        </DesignerProvider>
      )}
      {committed !== null && (
        <TransientNotice
          id={committed.at}
          tone={
            committed.version !== undefined && "error" in committed.version ? "warning" : "success"
          }
          text={[
            t("designer.sandbox.committed", { count: committed.count }),
            versionText(t, committed.version),
          ]
            .filter((part) => part !== "")
            .join(" ")}
          dismissLabel={t("actionsMenu.dismiss")}
          onDismiss={() => {
            setCommitted(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * The object to open again once the collector is read after a commit: by kind and
 * name, and the sandbox the commit was made from, which it waits past.
 */
interface Reselect {
  kind: ObjectKind;
  name: string;
  from: number;
}

function Workspace({
  history,
  onHistory,
  generation,
  reselect,
  onCommitStart,
  onReselected,
}: {
  history: { object: HistoryObject | null } | null;
  onHistory: (history: { object: HistoryObject | null } | null) => void;
  generation: number;
  reselect: Reselect | null;
  onCommitStart: (open: { kind: ObjectKind; name: string } | null) => void;
  onReselected: () => void;
}) {
  const designer = useDesigner();
  const search = useSearch({ from: "/compliance/designer" });
  const navigate = useNavigate({ from: "/compliance/designer" });
  const selected = parseSel(search.sel);
  const [variableDrop, setVariableDrop] = useState<{
    operation: CopyVariable;
    at: { x: number; y: number };
  } | null>(null);

  const select = (ref: Selection | null) => {
    void navigate({
      search: (previous) => ({
        ...previous,
        sel: ref === null ? undefined : `${ref.kind}:${String(ref.id)}`,
      }),
      resetScroll: false,
    });
  };

  // Ctrl+Z undoes the last change, outside of the fields, which keep their own undo.
  const undo = designer.undo;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || event.shiftKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target !== null &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      event.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [undo]);

  const obj =
    selected === null || selected.kind === "filterset" || selected.kind === "group"
      ? undefined
      : selected.kind === "ruleset"
        ? designer.draft.rulesets[selected.id]
        : designer.draft.modulesets[selected.id];
  // After a commit, the object that was open, by its name in the collector's data.
  useEffect(() => {
    // Not in the sandbox the commit was made from: in the one read after it.
    if (reselect === null || reselect.from === generation) return;
    const objects =
      reselect.kind === "ruleset"
        ? Object.values(designer.draft.rulesets)
        : Object.values(designer.draft.modulesets);
    const found = objects.find((o) => o.name === reselect.name);
    if (found !== undefined) select({ kind: reselect.kind, id: found.id });
    onReselected();
    // Once, on the sandbox read again after the commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reselect, generation]);

  const onVariableDrop = (operation: CopyVariable, at: { x: number; y: number }) => {
    setVariableDrop({ operation, at });
  };

  return (
    <SelectContext.Provider value={select}>
      <OpenHistoryContext.Provider
        value={(object) => {
          onHistory({ object });
        }}
      >
        <SandboxBar
          onCommitStart={() => {
            onCommitStart(obj === undefined ? null : { kind: obj.kind, name: obj.name });
          }}
        />
        <Notices />
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[19rem_1fr]">
          <Navigator selected={selected} onVariableDrop={onVariableDrop} />
          <div className="min-h-0 overflow-y-auto pr-1">
            {selected?.kind === "group" ? (
              <GroupView key={`g${String(selected.id)}`} id={selected.id} />
            ) : selected?.kind === "filterset" ? (
              <FiltersetView key={`f${String(selected.id)}`} id={selected.id} />
            ) : obj === undefined ? (
              <Welcome missing={selected !== null} />
            ) : obj.kind === "ruleset" ? (
              <RulesetEditor
                key={`r${String(obj.id)}`}
                ruleset={obj}
                onSelect={select}
                onDeleted={() => {
                  select(null);
                }}
                onVariableDrop={onVariableDrop}
              />
            ) : (
              <ModulesetEditor
                key={`m${String(obj.id)}`}
                moduleset={obj}
                onSelect={select}
                onDeleted={() => {
                  select(null);
                }}
              />
            )}
          </div>
        </div>
        {variableDrop !== null && (
          <VariableDropMenu
            operation={variableDrop.operation}
            at={variableDrop.at}
            onClose={() => {
              setVariableDrop(null);
            }}
          />
        )}
        <DragHint />
        <HistoryPanel
          // Another object starts the history again: its own filters and page.
          key={history?.object ? `${history.object.kind}:${String(history.object.id)}` : "all"}
          open={history !== null}
          object={history?.object ?? null}
          onClose={() => {
            onHistory(null);
          }}
          onClearObject={() => {
            onHistory({ object: null });
          }}
          canOpen={(change) =>
            change.kind === "ruleset"
              ? designer.draft.rulesets[change.id] !== undefined
              : change.kind === "moduleset"
                ? designer.draft.modulesets[change.id] !== undefined
                : true
          }
          onOpen={(change) => {
            select({ kind: change.kind, id: change.id });
          }}
        />
      </OpenHistoryContext.Provider>
    </SelectContext.Provider>
  );
}

/**
 * The reminder that nothing is saved yet, with the changes made, undo, reset and
 * the commit that saves them, its progress, and the change the collector refused.
 */
function SandboxBar({ onCommitStart }: { onCommitStart: () => void }) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const [showLog, setShowLog] = useState(false);
  // The action waiting for its confirmation, asked in a row of its own under the
  // toolbar rather than in it: the buttons stay where they are.
  const [confirming, setConfirming] = useState<"commit" | "reset" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failure, setFailure] = useState<{
    saved: number;
    total: number;
    change: string;
    message: string;
    version: string;
  } | null>(null);
  const count = designer.log.length;
  const committing = progress !== null;
  // The confirmation opens on its safe choice, for the keyboard.
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming !== null) cancelRef.current?.focus();
  }, [confirming]);

  async function commit() {
    // The log as committed: the refused change is named from it.
    const lines = designer.log;
    onCommitStart();
    setConfirming(null);
    setFailure(null);
    setProgress({ done: 0, total: lines.length });
    const result = await designer.commit(
      (done) => {
        setProgress({ done, total: lines.length });
      },
      (saved, total) => historyMessage(saved, total, designer.restoredFrom),
      i18n.getFixedT("en")("designer.history.baseline"),
    );
    setProgress(null);
    if (result.failure !== undefined) {
      const line = lines[result.failure.index];
      setFailure({
        saved: result.saved,
        total: result.total,
        change: line === undefined ? "" : t(line.key, line.values),
        message: result.failure.message,
        version: versionText(t, result.version),
      });
    }
  }

  const ROW = "mt-2 border-t border-state-warn/30 pt-2";
  return (
    <div className="rounded-(--radius-panel) border border-state-warn bg-state-warn-soft px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1">
          <span className="mr-2 font-semibold text-state-warn">
            <span aria-hidden="true">▲</span> {t("designer.sandbox.title")}
          </span>
          <span className="text-ink-muted">
            {designer.restoredFrom === undefined
              ? t("designer.sandbox.text")
              : t("designer.sandbox.restoring", { commit: designer.restoredFrom.slice(0, 7) })}
          </span>
        </p>
        {count === 0 ? (
          <span className="text-ink-muted">{t("designer.sandbox.none")}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={showLog}
              className={BUTTON}
              onClick={() => {
                setShowLog(!showLog);
              }}
            >
              {t("designer.sandbox.changes", { count })}
              <ChevronDownIcon
                className={`h-3 w-3 transition-transform ${showLog ? "rotate-180" : ""}`}
              />
            </button>
            <button
              type="button"
              disabled={committing}
              className={BUTTON}
              title={t("designer.sandbox.undoHint")}
              onClick={designer.undo}
            >
              <ResetIcon className="h-3.5 w-3.5" />
              {t("designer.sandbox.undo")}
            </button>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-state-warn/30" />
            <button
              type="button"
              disabled={committing}
              aria-expanded={confirming === "reset"}
              className={`${BUTTON} hover:text-state-down`}
              onClick={() => {
                setConfirming(confirming === "reset" ? null : "reset");
              }}
            >
              {t("designer.sandbox.reset")}
            </button>
            <button
              type="button"
              disabled={committing}
              aria-expanded={confirming === "commit"}
              className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
              onClick={() => {
                setConfirming(confirming === "commit" ? null : "commit");
              }}
            >
              {committing
                ? t("designer.sandbox.committing", {
                    done: progress.done,
                    total: progress.total,
                  })
                : t("designer.sandbox.commit")}
            </button>
          </div>
        )}
      </div>

      {confirming !== null && count > 0 && (
        <div className={`${ROW} flex flex-wrap items-center gap-x-4 gap-y-2`}>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {confirming === "commit"
                ? t("designer.sandbox.commitQuestion", { count })
                : t("designer.sandbox.resetQuestion", { count })}
            </p>
            {confirming === "commit" && (
              <p className="text-ink-muted">{t("designer.sandbox.commitDetails")}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              ref={cancelRef}
              type="button"
              className={BUTTON}
              onClick={() => {
                setConfirming(null);
              }}
            >
              {t("designer.cancel")}
            </button>
            {confirming === "commit" ? (
              <button
                type="button"
                className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
                onClick={() => {
                  void commit();
                }}
              >
                {t("designer.sandbox.commitConfirm", { count })}
              </button>
            ) : (
              <button
                type="button"
                className="h-7 rounded-(--radius-control) bg-state-down px-3 font-medium text-surface-raised"
                onClick={() => {
                  designer.reset();
                  setConfirming(null);
                  setShowLog(false);
                  setFailure(null);
                }}
              >
                {t("designer.sandbox.resetConfirm", { count })}
              </button>
            )}
          </div>
        </div>
      )}

      {failure !== null && (
        <p role="alert" className={`${ROW} text-state-down`}>
          ■{" "}
          {t("designer.sandbox.commitFailed", {
            saved: failure.saved,
            total: failure.total,
            change: failure.change,
            message: failure.message,
          })}
          {failure.version !== "" && ` ${failure.version}`}
        </p>
      )}

      {showLog && count > 0 && (
        <ol className={`${ROW} max-h-40 list-decimal space-y-0.5 overflow-y-auto pl-6`}>
          {designer.log.map((line, i) => (
            <li key={i}>{t(line.key, line.values)}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The outcome of the last operations, announced to assistive technologies. */
function Notices() {
  const designer = useDesigner();
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-40 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {designer.notices.map((notice) => (
        <NoticeItem
          key={notice.id}
          notice={notice}
          onDismiss={() => {
            designer.dismiss(notice.id);
          }}
        />
      ))}
    </div>
  );
}

/**
 * A notice of the designer, which leaves by itself after the time to read it,
 * longer when the operation was refused; hovered or focused, it waits.
 */
function NoticeItem({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const { t } = useTranslation();
  const text = t(notice.key, {
    ...notice.values,
    ...(notice.inner === undefined ? {} : { what: t(notice.inner.key, notice.inner.values) }),
  });
  const tone = notice.tone === "refused" ? "error" : "success";
  const dismissal = useAutoDismiss(
    notice.id,
    noticeTime(text, notice.tone === "refused"),
    onDismiss,
  );
  return (
    <div
      {...dismissal.handlers}
      // Tinted as the other temporary messages: red when refused, green when done.
      className={`notice-in flex items-start gap-2 rounded-(--radius-panel) border px-3 py-2 font-medium text-ink shadow transition-opacity duration-400 motion-reduce:transition-none ${
        NOTICE_TONES[tone].box
      } ${dismissal.leaving ? "opacity-0" : "opacity-100"}`}
    >
      <span aria-hidden="true" className={NOTICE_TONES[tone].markClass}>
        {notice.tone === "refused" ? "■" : "✓"}
      </span>
      <span className="flex-1">{text}</span>
      <button
        type="button"
        aria-label={t("designer.dismiss")}
        onClick={onDismiss}
        className="text-ink-muted hover:text-ink"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Asked where a variable was dropped on another ruleset: copy it there, or move it. */
function VariableDropMenu({
  operation,
  at,
  onClose,
}: {
  operation: CopyVariable;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const designer = useDesigner();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const variable = designer.draft.rulesets[operation.fromId]?.variables.find(
    (v) => v.id === operation.variableId,
  );
  const to = designer.draft.rulesets[operation.toId];
  const choose = (move: boolean) => {
    designer.runAndTell({ ...operation, move });
    onClose();
  };
  return (
    <div
      role="dialog"
      aria-label={t("designer.dropVariable", {
        name: variable?.name ?? "",
        ruleset: to?.name ?? "",
      })}
      style={{
        left: Math.min(at.x, window.innerWidth - 260),
        top: Math.min(at.y, window.innerHeight - 140),
      }}
      className="fixed z-50 w-60 rounded-(--radius-panel) border border-line bg-surface-raised p-2 shadow-lg"
    >
      <p className="mb-2">
        {t("designer.dropVariable", { name: variable?.name ?? "", ruleset: to?.name ?? "" })}
      </p>
      <div className="flex flex-col gap-1">
        <button
          ref={first}
          type="button"
          className={BUTTON}
          onClick={() => {
            choose(false);
          }}
        >
          {t("designer.copyHere")}
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            choose(true);
          }}
        >
          {t("designer.moveHere")}
        </button>
        <button type="button" className={BUTTON} onClick={onClose}>
          {t("designer.cancel")}
        </button>
      </div>
    </div>
  );
}

/** What to do when nothing is selected: the ways to work in the designer. */
function Welcome({ missing }: { missing: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-2xl space-y-2 rounded-(--radius-panel) border border-line p-4">
      {missing && <p className="text-state-warn">▲ {t("designer.welcome.missing")}</p>}
      <p className="font-semibold">{t("designer.welcome.title")}</p>
      <ul className="list-disc space-y-1 pl-5">
        {(["select", "drag", "variables", "teams", "undo"] as const).map((tip) => (
          <li key={tip}>{t(`designer.welcome.${tip}`)}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The message of the version recording a commit, in English whatever the
 * language of the page: the history is shared. The subject counts the changes,
 * the body lists them, one per line.
 */
function historyMessage(saved: LogLine[], total: number, restoredFrom?: string): string {
  const en = i18n.getFixedT("en");
  const base =
    saved.length === total
      ? en("designer.history.subject", { count: saved.length })
      : en("designer.history.subjectPartial", { count: saved.length, total });
  // A restore says which version it brings back.
  const subject =
    restoredFrom === undefined
      ? base
      : en("designer.history.restoreSubject", { commit: restoredFrom.slice(0, 7), subject: base });
  return [subject, "", ...saved.map((line) => `- ${en(line.key, line.values)}`)].join("\n");
}

/** What the commit's notice says of the version recorded, empty when nothing changed. */
function versionText(t: TFunction, version: RecordedVersion | undefined): string {
  if (version === undefined) return "";
  if ("error" in version) return t("designer.history.failed", { message: version.error });
  return version.changed
    ? t("designer.history.recorded", { commit: version.commit.slice(0, 7) })
    : "";
}
