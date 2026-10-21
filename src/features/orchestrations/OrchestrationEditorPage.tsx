import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DateTime } from "@/components/ui/DateTime";
import {
  useDeleteOrchestration,
  useOrchestration,
  useOrchestrationCheck,
  useSaveOrchestration,
  type CheckStep,
  type Orchestration,
  type OrchestrationInput,
} from "./api";
import { useRecentRuns } from "./list";
import { isRunStatus } from "./run-status";
import { RunStatusPill } from "./RunStatusPill";
import { emptyStep } from "./helpers";
import { StartRunConfirmation } from "./RunConfirmations";
import { StepEditor } from "./StepEditor";
import { BUTTON, CARD, INPUT, PRIMARY } from "./ui";

/** The value, once it stopped changing for `ms`: the check waits for a pause in typing. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(value);
    }, ms);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, ms]);
  return settled;
}

const blank: OrchestrationInput = { name: "", description: "", steps: [emptyStep()] };

function toInput(o: Orchestration): OrchestrationInput {
  return { name: o.name, description: o.description, steps: o.steps };
}

/**
 * The editor of an orchestration (`/orchestrations/$orchestrationId`, "new" to
 * create one): its name, its steps, and beside them what a run starting now
 * would act on, each target checked as the action queue would. A saved plan
 * runs after a confirmation that names what it will do.
 */
export function OrchestrationEditorPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const raw = (params as { orchestrationId?: string }).orchestrationId;
  const id = raw === undefined || raw === "new" ? undefined : Number(raw);
  const saved = useOrchestration(id);
  const save = useSaveOrchestration(id);
  const remove = useDeleteOrchestration();
  const runs = useRecentRuns(id);
  const [draft, setDraft] = useState<OrchestrationInput>(blank);
  const [loadedId, setLoadedId] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const nameId = useId();

  // The saved plan becomes the draft once read, and again for another one.
  if (saved.data !== undefined && saved.data.id !== loadedId) {
    setLoadedId(saved.data.id);
    setDraft(toInput(saved.data));
  }
  const dirty =
    id === undefined || saved.data === undefined
      ? true
      : JSON.stringify(toInput(saved.data)) !== JSON.stringify(draft);
  const settled = useSettled(draft, 600);
  const check = useOrchestrationCheck(settled, true);
  const checkOf = (index: number): CheckStep | undefined => check.data?.[index];
  const refused = (check.data ?? []).reduce(
    (n, step) =>
      n + step.targets.filter((target) => !target.ok).length + (step.message === "" ? 0 : 1),
    0,
  );

  const setSteps = (steps: OrchestrationInput["steps"]) => {
    setDraft({ ...draft, steps });
  };

  if (id !== undefined && saved.isError)
    return <p className="text-state-down">■ {saved.error.message}</p>;
  if (id !== undefined && saved.isPending)
    return <p className="text-ink-muted">{t("detail.loading")}</p>;

  return (
    <section>
      <div className="mb-1 text-data text-ink-muted">
        <Link to="/orchestrations" className="hover:underline">
          {t("orchestrations.title")}
        </Link>{" "}
        ›
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="orchestration" className="h-5 w-5" />
          {id === undefined ? t("orchestrations.newTitle") : draft.name || saved.data?.name}
        </h1>
        {dirty && id !== undefined && (
          <span className="rounded-full bg-surface-sunken px-2 text-data text-ink-muted">
            {t("orchestrations.unsaved")}
          </span>
        )}
        {/* Beside the title: the right edge is where the panel anchor floats (`PanelAnchor`). */}
        {id !== undefined && (
          <ConfirmButton
            label={t("orchestrations.delete")}
            question={t("orchestrations.deleteQuestion", { name: saved.data?.name ?? "" })}
            confirmLabel={t("detail.deleteConfirm")}
            cancelLabel={t("detail.cancel")}
            pendingLabel={t("detail.deleting")}
            pending={remove.isPending}
            inline
            onConfirm={() => {
              remove.mutate(id, {
                onSuccess: () => {
                  void navigate({ to: "/orchestrations" });
                },
              });
            }}
          />
        )}
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => {
            save.mutate(draft, {
              onSuccess: (o) => {
                if (id === undefined)
                  void navigate({
                    to: "/orchestrations/$orchestrationId",
                    params: { orchestrationId: String(o.id) },
                    replace: true,
                  });
              },
            });
          }}
          className={id === undefined ? PRIMARY : BUTTON}
        >
          {save.isPending ? t("orchestrations.saving") : t("orchestrations.save")}
        </button>
        {id !== undefined && (
          <button
            type="button"
            disabled={dirty}
            title={dirty ? t("orchestrations.saveBeforeRun") : undefined}
            onClick={() => {
              setConfirming(true);
            }}
            className={PRIMARY}
          >
            ▶ {t("orchestrations.runButton")}
          </button>
        )}
      </div>
      {save.isError && (
        <p role="alert" className="mb-3 text-state-down">
          ■ {save.error.message}
        </p>
      )}
      {remove.isError && (
        <p role="alert" className="mb-3 text-state-down">
          ■ {remove.error.message}
        </p>
      )}

      <div className="mb-3 grid max-w-3xl grid-cols-[7rem_1fr] items-start gap-x-3 gap-y-2">
        <label htmlFor={nameId} className="pt-1 text-ink-muted">
          {t("orchestrations.fields.name")}
        </label>
        <input
          id={nameId}
          value={draft.name}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value });
          }}
          className={`${INPUT} w-full`}
        />
        <label htmlFor={`${nameId}-d`} className="pt-1 text-ink-muted">
          {t("orchestrations.fields.description")}
        </label>
        <textarea
          id={`${nameId}-d`}
          rows={2}
          value={draft.description ?? ""}
          onChange={(event) => {
            setDraft({ ...draft, description: event.target.value });
          }}
          className="w-full rounded-(--radius-control) border border-line bg-surface p-2"
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-4">
        <div>
          <ol className="flex flex-col gap-3">
            {draft.steps.map((step, index) => (
              <StepEditor
                key={index}
                step={step}
                index={index}
                steps={draft.steps}
                check={checkOf(index)}
                selected={index === selected}
                onSelect={() => {
                  setSelected(index);
                }}
                onChange={(next) => {
                  setSteps(draft.steps.map((s, i) => (i === index ? next : s)));
                }}
                onRemove={() => {
                  setSteps(draft.steps.filter((_, i) => i !== index));
                  setSelected(Math.max(0, Math.min(selected, draft.steps.length - 2)));
                }}
                onMove={(by) => {
                  const steps = [...draft.steps];
                  const [moved] = steps.splice(index, 1);
                  if (moved === undefined) return;
                  steps.splice(index + by, 0, moved);
                  setSteps(steps);
                  setSelected(index + by);
                }}
              />
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              setSteps([...draft.steps, emptyStep(draft.steps[draft.steps.length - 1]?.kind)]);
              setSelected(draft.steps.length);
            }}
            className="mt-3 w-full rounded-(--radius-panel) border border-dashed border-line-strong py-2 text-accent hover:bg-surface-sunken"
          >
            ＋ {t("orchestrations.addStep")}
          </button>
          <p className="mt-2 text-ink-muted">{t("orchestrations.failureRule")}</p>
        </div>

        <aside className="flex flex-col gap-3">
          <CheckPanel step={selected} check={checkOf(selected)} pending={check.isFetching} />
          {refused > 0 && (
            <p className="text-state-warn">
              ▲ {t("orchestrations.check.problems", { count: refused })}
            </p>
          )}
          {id !== undefined && (runs.data ?? []).length > 0 && (
            <div className={CARD}>
              <h2 className="border-b border-line px-3 py-2 font-semibold">
                {t("orchestrations.runs.recent")}
              </h2>
              <ul>
                {(runs.data ?? []).map((run) => (
                  <li key={run.id} className="border-b border-line/60 last:border-b-0">
                    <Link
                      to="/orchestrations/runs/$runId"
                      params={{ runId: String(run.id ?? "") }}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-sunken/60"
                    >
                      {isRunStatus(run.status) && <RunStatusPill status={run.status} />}
                      <DateTime value={run.started} locale={i18n.language} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {confirming && id !== undefined && saved.data !== undefined && (
        <StartRunConfirmation
          orchestrationId={id}
          onClose={() => {
            setConfirming(false);
          }}
        />
      )}
    </section>
  );
}

/** What the selected step would act on, a run starting now, each target checked. */
function CheckPanel({
  step,
  check,
  pending,
}: {
  step: number;
  check: CheckStep | undefined;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const ok = check?.targets.filter((target) => target.ok).length ?? 0;
  const ko = (check?.targets.length ?? 0) - ok;
  return (
    <div className={CARD} aria-live="polite">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="font-semibold">{t("orchestrations.check.title", { n: step + 1 })}</h2>
        <span className="flex-1" />
        {pending && <span className="text-ink-muted">{t("orchestrations.check.checking")}</span>}
        {!pending && check !== undefined && check.message === "" && (
          <span
            className={`rounded-full px-2 text-data ${ko > 0 ? "bg-state-warn-soft text-state-warn" : "bg-state-up-soft text-state-up"}`}
          >
            {ko > 0
              ? `▲ ${t("orchestrations.check.refused", { count: ko })}`
              : `✓ ${t("orchestrations.check.ready", { count: ok })}`}
          </span>
        )}
      </div>
      {check === undefined ? (
        <p className="px-3 py-2 text-ink-muted">{t("orchestrations.check.none")}</p>
      ) : check.message !== "" ? (
        <p className="px-3 py-2 text-state-down">■ {check.message}</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {check.targets.map((target, index) => (
            <li key={index} className="border-b border-line/60 px-3 py-1.5 last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{target.label}</span>
                {target.ok ? (
                  <span className="text-state-up">✓ {t("orchestrations.check.targetReady")}</span>
                ) : (
                  <span className="text-state-warn">
                    ▲ {t("orchestrations.check.targetRefused")}
                  </span>
                )}
              </div>
              {!target.ok && <div className="text-data text-state-warn">{target.message}</div>}
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-3 py-2 text-data text-ink-muted">
        {t("orchestrations.check.hint")}
      </p>
    </div>
  );
}
