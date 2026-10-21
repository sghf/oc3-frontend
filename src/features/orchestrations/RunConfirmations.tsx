import { useNavigate } from "@tanstack/react-router";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import {
  DESTRUCTIVE_ACTIONS,
  useOrchestration,
  useOrchestrationCheck,
  useContinueRun,
  useRunCommand,
  useStartRun,
  type OrchestrationStep,
  type Run,
} from "./api";
import { BUTTON, INPUT, PRIMARY } from "./ui";

/** A step as a confirmation lists it: its plan, how many targets it will run on, how many refused. */
interface StepLine {
  index: number;
  step: OrchestrationStep;
  targets: number;
  refused: number;
  /** Said after the counts: "1 left of 3" say. */
  note?: string;
}

/**
 * The window confirming a run before it starts or resumes: what it will do,
 * step by step, the rule that the first failed step stops it, and the name of
 * the orchestration to type when a step to run interrupts what runs (stop,
 * reboot…).
 */
function RunConfirmDialog({
  title,
  intro,
  lines,
  name,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  commentLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  intro: ReactNode;
  lines: StepLine[];
  /** The name to type when a step interrupts what runs. */
  name: string;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: Error | null;
  /** A comment is required, under this label, and given to onConfirm. */
  commentLabel?: string;
  onConfirm: (comment: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const [comment, setComment] = useState("");
  const typedId = useId();
  const commentId = useId();
  const commentMissing = commentLabel !== undefined && comment.trim() === "";
  const destructive = lines.some((line) => DESTRUCTIVE_ACTIONS.has(line.step.action));
  return (
    <Modal title={title} closeLabel={t("detail.close")} onClose={onClose} className="max-w-xl">
      <p className="mb-2">{intro}</p>
      <ol className="mb-3 flex flex-col gap-1">
        {lines.map(({ index, step, targets, refused, note }) => (
          <li key={index} className="flex flex-wrap items-center gap-x-2">
            <span className="w-5 text-right text-ink-muted tabular-nums">{index + 1}.</span>
            <span className="font-medium">{step.name === "" ? step.action : step.name}</span>
            <span className="text-ink-muted">
              {step.name === "" ? "" : `${step.action} · `}
              {note ?? t("orchestrations.confirm.targets", { count: targets })} ·{" "}
              {t(`orchestrations.step.paces.${step.pace}`)}
            </span>
            {DESTRUCTIVE_ACTIONS.has(step.action) && (
              <span className="text-state-down">■ {t("orchestrations.confirm.disruptive")}</span>
            )}
            {refused > 0 && (
              <span className="text-state-warn">
                ▲ {t("orchestrations.check.refused", { count: refused })}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="mb-3 text-ink-muted">{t("orchestrations.confirm.rule")}</p>
      {commentLabel !== undefined && (
        <div className="mb-3">
          <label htmlFor={commentId} className="mb-1 block font-medium">
            {commentLabel}
          </label>
          <textarea
            id={commentId}
            rows={3}
            required
            aria-required="true"
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
            }}
            className="w-full rounded-(--radius-control) border border-line bg-surface p-2"
          />
        </div>
      )}
      {destructive && (
        <div className="mb-3">
          <label htmlFor={typedId} className="mb-1 block font-medium">
            {t("orchestrations.confirm.typeName", { name })}
          </label>
          <input
            id={typedId}
            value={typed}
            autoComplete="off"
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            className={`${INPUT} w-full`}
          />
        </div>
      )}
      {error !== null && (
        <p role="alert" className="mb-3 text-state-down">
          ■ {error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={BUTTON}>
          {t("detail.cancel")}
        </button>
        <button
          type="button"
          disabled={pending || commentMissing || (destructive && typed !== name)}
          onClick={() => {
            onConfirm(comment.trim());
          }}
          className={PRIMARY}
        >
          ▶ {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/**
 * The confirmation of a new run of an orchestration, from its editor or from a
 * past run ("Run again"): the plan as it stands now, which may differ from the
 * one of that run, each step with the targets it matches now, checked as the
 * action queue will.
 */
export function StartRunConfirmation({
  orchestrationId,
  onClose,
}: {
  orchestrationId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const orchestration = useOrchestration(orchestrationId);
  const steps = orchestration.data?.steps ?? [];
  const check = useOrchestrationCheck(
    { name: orchestration.data?.name ?? "", steps },
    orchestration.data !== undefined,
  );
  const start = useStartRun();
  const name = orchestration.data?.name ?? "";
  const lines = steps.map((step, index) => {
    const c = check.data?.[index];
    return {
      index,
      step,
      targets: c?.targets.length ?? 0,
      refused: c?.targets.filter((target) => !target.ok).length ?? 0,
    };
  });
  const total = lines.reduce((n, line) => n + line.targets, 0);
  return (
    <RunConfirmDialog
      title={t("orchestrations.confirm.title", { name })}
      intro={
        orchestration.isPending || check.isPending
          ? t("orchestrations.check.checking")
          : t("orchestrations.confirm.summary", {
              steps: t("orchestrations.confirm.steps", { count: steps.length }),
              count: total,
            })
      }
      lines={lines}
      name={name}
      confirmLabel={t("orchestrations.confirm.start")}
      pendingLabel={t("orchestrations.confirm.starting")}
      pending={start.isPending || orchestration.isPending || check.isPending}
      error={orchestration.error ?? start.error}
      onConfirm={() => {
        start.mutate(orchestrationId, {
          onSuccess: (run) => {
            onClose();
            void navigate({ to: "/orchestrations/runs/$runId", params: { runId: String(run.id) } });
          },
        });
      }}
      onClose={onClose}
    />
  );
}

/**
 * The confirmation of resuming a failed or stopped run: the targets of its step
 * that did not succeed run again, with the targets the run resolved when it
 * started, then the next steps.
 */
export function ResumeRunConfirmation({ run, onClose }: { run: Run; onClose: () => void }) {
  const { t } = useTranslation();
  const resume = useRunCommand(run.id, "resume");
  const lines = run.steps.flatMap((runStep) => {
    const step = run.plan[runStep.step];
    if (step === undefined || runStep.step < run.current_step) return [];
    const total = Object.values(runStep.counts).reduce((n, v) => n + v, 0);
    if (runStep.step > run.current_step)
      return [{ index: runStep.step, step, targets: total, refused: 0 }];
    const again = total - (runStep.counts.ok ?? 0);
    return [
      {
        index: runStep.step,
        step,
        targets: again,
        refused: 0,
        note: t("orchestrations.confirm.again", { count: again, total }),
      },
    ];
  });
  const total = lines.reduce((n, line) => n + line.targets, 0);
  return (
    <RunConfirmDialog
      title={t("orchestrations.confirm.resumeTitle", { name: run.name, n: run.current_step + 1 })}
      intro={t("orchestrations.confirm.resumeSummary", {
        steps: t("orchestrations.confirm.steps", { count: lines.length }),
        count: total,
      })}
      lines={lines}
      name={run.name}
      confirmLabel={t("orchestrations.confirm.resume")}
      pendingLabel={t("orchestrations.confirm.resuming")}
      pending={resume.isPending}
      error={resume.error}
      onConfirm={() => {
        resume.mutate(undefined, { onSuccess: onClose });
      }}
      onClose={onClose}
    />
  );
}

/**
 * The confirmation of going on past the failed or stopped step of a run: its
 * outcome is acknowledged, with a comment saying why, which is required, then the next
 * steps run with the targets resolved when the run started. After the last
 * step, the run ends as succeeded.
 */
export function ContinueRunConfirmation({ run, onClose }: { run: Run; onClose: () => void }) {
  const { t } = useTranslation();
  const proceed = useContinueRun(run.id);
  const failed = run.plan[run.current_step];
  const lines = run.steps.flatMap((runStep) => {
    const step = run.plan[runStep.step];
    if (step === undefined || runStep.step <= run.current_step) return [];
    const total = Object.values(runStep.counts).reduce((n, v) => n + v, 0);
    return [{ index: runStep.step, step, targets: total, refused: 0 }];
  });
  const total = lines.reduce((n, line) => n + line.targets, 0);
  const failedName = failed === undefined ? "" : failed.name === "" ? failed.action : failed.name;
  return (
    <RunConfirmDialog
      title={t(
        run.status === "stopped"
          ? "orchestrations.confirm.continueTitleStopped"
          : "orchestrations.confirm.continueTitle",
        {
          n: run.current_step + 1,
          name: failedName,
        },
      )}
      intro={
        <>
          {run.message !== "" && (
            <span className="mb-1 block text-state-down">✕ {run.message}</span>
          )}
          {lines.length === 0
            ? t("orchestrations.confirm.continueLast")
            : t("orchestrations.confirm.continueSummary", {
                steps: t("orchestrations.confirm.steps", { count: lines.length }),
                count: total,
              })}
        </>
      }
      lines={lines}
      name={run.name}
      commentLabel={t("orchestrations.confirm.continueComment")}
      confirmLabel={t("orchestrations.confirm.continue")}
      pendingLabel={t("orchestrations.confirm.continuing")}
      pending={proceed.isPending}
      error={proceed.error}
      onConfirm={(comment) => {
        proceed.mutate(comment, { onSuccess: onClose });
      }}
      onClose={onClose}
    />
  );
}
