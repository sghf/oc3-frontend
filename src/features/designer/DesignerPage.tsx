import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { noticeTime, useAutoDismiss } from "@/components/ui/use-auto-dismiss";
import { NOTICE_TONES } from "@/components/ui/notice-tones";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { CloseIcon, ResetIcon } from "@/components/ui/icons";
import { useFormUser } from "@/features/forms/use-form-user";
import { useDesigner, type Notice } from "./designer-context";
import { DragHint, DragProvider } from "./dnd";
import { ModulesetEditor } from "./ModulesetEditor";
import type { Operation } from "./model";
import { Navigator } from "./Navigator";
import { RulesetEditor } from "./RulesetEditor";
import { DesignerProvider } from "./store";
import { FiltersetView } from "./FiltersetView";
import { GroupView } from "./GroupView";
import { BUTTON, SelectContext, type Selection } from "./ui";
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
 * and teams, shaped by pickers or by drag and drop. A sandbox for now: the
 * changes stay in the browser tab, the collector's data is only read.
 */
export function DesignerPage() {
  const { t } = useTranslation();
  const draft = useDesignerDraft();
  const user = useFormUser();
  return (
    <section className="flex h-[calc(100dvh-2.75rem-2rem)] flex-col gap-3">
      <h1 className="flex items-center gap-2 text-title font-semibold">
        <ObjectIcon kind="designer" className="h-5 w-5" />
        {t("designer.title")}
      </h1>
      {draft.isPending ? (
        <p className="text-ink-muted">{t("designer.loading")}</p>
      ) : draft.isError ? (
        <p className="text-state-down">■ {draft.error.message}</p>
      ) : (
        <DesignerProvider original={draft.data} author={user.data?.name.trim() ?? ""}>
          <DragProvider>
            <Workspace />
          </DragProvider>
        </DesignerProvider>
      )}
    </section>
  );
}

function Workspace() {
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
  const onVariableDrop = (operation: CopyVariable, at: { x: number; y: number }) => {
    setVariableDrop({ operation, at });
  };

  return (
    <SelectContext.Provider value={select}>
      <SandboxBar />
      <Notices />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[18rem_1fr]">
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
    </SelectContext.Provider>
  );
}

/** The reminder that nothing is saved, with the changes made, undo and reset. */
function SandboxBar() {
  const { t } = useTranslation();
  const designer = useDesigner();
  const [showLog, setShowLog] = useState(false);
  const count = designer.log.length;
  return (
    <div className="rounded-(--radius-panel) border border-state-warn bg-state-warn-soft px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-state-warn">▲ {t("designer.sandbox.title")}</span>
        <span>{t("designer.sandbox.text")}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={showLog}
            disabled={count === 0}
            className={BUTTON}
            onClick={() => {
              setShowLog(!showLog);
            }}
          >
            {t("designer.sandbox.changes", { count })}
          </button>
          <button
            type="button"
            disabled={count === 0}
            className={BUTTON}
            title={t("designer.sandbox.undoHint")}
            onClick={designer.undo}
          >
            <ResetIcon className="h-3.5 w-3.5" />
            {t("designer.sandbox.undo")}
          </button>
          {count > 0 && (
            <ConfirmButton
              label={t("designer.sandbox.reset")}
              question={t("designer.sandbox.resetQuestion", { count })}
              confirmLabel={t("designer.sandbox.reset")}
              cancelLabel={t("designer.cancel")}
              pendingLabel={t("designer.sandbox.reset")}
              onConfirm={() => {
                designer.reset();
                setShowLog(false);
              }}
            />
          )}
        </div>
      </div>
      {showLog && count > 0 && (
        <ol className="mt-2 max-h-40 list-decimal space-y-0.5 overflow-y-auto pl-6">
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
