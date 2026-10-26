import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { SlideOver } from "@/components/ui/SlideOver";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { StatusBadge, type ObjectState } from "@/components/opensvc/StatusBadge";
import { DateTime } from "@/components/ui/DateTime";
import { FormRender } from "@/features/forms/FormRender";
import { FormValue } from "@/features/forms/FormValue";
import { parseDefinition } from "@/features/forms/form-engine";
import { useFormUser } from "@/features/forms/use-form-user";
import { RequestResults } from "./RequestResults";
import {
  isAssignedTo,
  nextForms,
  stepLabel,
  useMyGroupRoles,
  useRequest,
  useRequestSteps,
  useSubmittableForm,
  type StoredFormRow,
} from "./request-steps";

/** What a decision submitted from the panel gave: the form chosen and its results. */
interface Outcome {
  label: string;
  resultsId: number | null;
  results: unknown;
}

/** Status of a request, as in the lists: a shape and a label, not the tint alone. */
const STATUS: Record<string, ObjectState> = { pending: "warn", closed: "unknown" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A request: its status and who it awaits, the decision on its current step when
 * it awaits the user, then its steps from the first one, each with the data it was
 * submitted with. The historical workflow tab (`workflow()` of `requests.js`).
 *
 * Deciding is submitting one of the forms the current step names as its next
 * (`NextForms`), as the next step of the request (`prev_wfid`). The choice is
 * offered only to the assignee of the step, their name or one of their groups,
 * which the API checks too.
 */
export function RequestDetailPanel({
  workflowId,
  onClose,
}: {
  workflowId: string | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const request = useRequest(workflowId);
  const steps = useRequestSteps(request.data?.form_head_id);
  const open = workflowId !== undefined;
  const row = request.data;
  const label = steps.data?.[0] === undefined ? (row?.form_name ?? "") : stepLabel(steps.data[0]);
  const title =
    row?.form_head_id === undefined
      ? t("requestDetail.title")
      : t("requestDetail.heading", { id: row.form_head_id, label });
  const current = steps.data?.find((step) => step.id === row?.last_form_id);
  // The outcome of a decision made here stays in sight once the request has moved
  // on, the step it decided being no longer the current one. Another request, none.
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  useEffect(() => {
    setOutcome(null);
  }, [workflowId]);

  return (
    <SlideOver
      open={open}
      title={title}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="form" />}
      size="wide"
    >
      {request.isPending || (row !== null && steps.isPending) ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : request.isError || steps.isError ? (
        <p role="alert" className="text-state-down">
          ■ {request.error?.message ?? steps.error?.message}
        </p>
      ) : row === null || row === undefined ? (
        <p className="text-ink-muted">{t("requestDetail.notFound")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt className="text-ink-muted">{t("allRequests.fields.status")}</dt>
            <dd>
              <StatusBadge
                state={STATUS[row.status ?? ""] ?? "unknown"}
                label={
                  row.status !== undefined && row.status in STATUS
                    ? t(`allRequests.status.${row.status}`)
                    : (row.status ?? "")
                }
              />
            </dd>
            <dt className="text-ink-muted">{t("allRequests.fields.creator")}</dt>
            <dd>{row.creator?.trim()}</dd>
            <dt className="text-ink-muted">{t("allRequests.fields.create_date")}</dt>
            <dd>
              <DateTime value={row.create_date} />
            </dd>
            <dt className="text-ink-muted">{t("allRequests.fields.steps")}</dt>
            <dd>{row.steps}</dd>
            {row.status === "pending" && (
              <>
                <dt className="text-ink-muted">{t("requestDetail.awaiting")}</dt>
                <dd className="font-medium">{row.last_assignee?.trim()}</dd>
              </>
            )}
          </dl>

          {outcome !== null ? (
            <DecisionBox>
              <p role="status" className="font-medium">
                <span aria-hidden="true" className="text-state-up">
                  ●{" "}
                </span>
                {t("requestDetail.submittedDecision", { label: outcome.label })}
              </p>
              {outcome.resultsId !== null && (
                <RequestResults resultsId={outcome.resultsId} initial={outcome.results} />
              )}
            </DecisionBox>
          ) : (
            row.status === "pending" &&
            current !== undefined && (
              <Decision
                key={current.id}
                step={current}
                workflowId={workflowId ?? ""}
                headId={row.form_head_id}
                onDecided={setOutcome}
              />
            )
          )}

          <section aria-labelledby="request-steps">
            <h3 id="request-steps" className="mb-2 font-semibold">
              {t("requestDetail.steps")}
            </h3>
            <ol className="flex flex-col gap-3">
              {(steps.data ?? []).map((step, index) => (
                <Step
                  key={step.id}
                  step={step}
                  index={index + 1}
                  current={step.id === row.last_form_id && row.status === "pending"}
                />
              ))}
            </ol>
          </section>
        </div>
      )}
    </SlideOver>
  );
}

/**
 * A step of the request: its form, who submitted it and when, whom it went to, its
 * data, and the log of its outputs, opened on demand, as the historical workflow
 * tab showed the results of each step.
 */
function Step({ step, index, current }: { step: StoredFormRow; index: number; current: boolean }) {
  const { t } = useTranslation();
  const [showLogs, setShowLogs] = useState(false);
  const resultsId =
    typeof step.results_id === "number" && step.results_id > 0 ? step.results_id : null;
  const logsId = `request-step-${String(step.id)}-logs`;
  return (
    <li
      className={`rounded-(--radius-panel) border p-3 ${current ? "border-accent" : "border-line"}`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-ink-muted">{t("requestDetail.stepNumber", { index })}</span>
        <span className="font-medium">{stepLabel(step)}</span>
        {current && (
          <span className="rounded-(--radius-pill) bg-accent-soft px-2 text-ink">
            {t("requestDetail.current")}
          </span>
        )}
      </div>
      <p className="text-ink-muted">
        {t("requestDetail.submitted", { who: step.form_submitter?.trim() ?? "" })}{" "}
        <DateTime value={step.form_submit_date} />
        {step.form_assignee !== null && step.form_assignee !== undefined && (
          <> · {t("requestDetail.assignedTo", { who: step.form_assignee.trim() })}</>
        )}
      </p>
      <FormValue formName={step.form_name ?? ""} value={step.form_data ?? undefined} />
      {resultsId !== null && (
        <div className="mt-2">
          <button
            type="button"
            aria-expanded={showLogs}
            aria-controls={logsId}
            onClick={() => {
              setShowLogs(!showLogs);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-(--radius-control) border border-line px-2 hover:bg-surface-sunken"
          >
            <span aria-hidden="true">{showLogs ? "▾" : "▸"}</span>
            {showLogs ? t("requestDetail.hideLogs") : t("requestDetail.showLogs")}
          </button>
          <div id={logsId}>
            {showLogs && (
              <RequestResults
                resultsId={resultsId}
                title={t("requestDetail.logsTitle", { index })}
              />
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** The frame of the decision on the current step, and of its outcome. */
function DecisionBox({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="request-decision"
      className="flex flex-col gap-2 rounded-(--radius-panel) border border-line bg-surface p-3"
    >
      <h3 id="request-decision" className="font-semibold">
        {t("requestDetail.decision")}
      </h3>
      {children}
    </section>
  );
}

/**
 * The decision on the current step: the next forms to choose from, then the
 * chosen one to fill in and submit. To anyone else than the assignee, who it
 * awaits.
 */
function Decision({
  step,
  workflowId,
  headId,
  onDecided,
}: {
  step: StoredFormRow;
  workflowId: string;
  headId: number | undefined;
  onDecided: (outcome: Outcome) => void;
}) {
  const { t } = useTranslation();
  const user = useFormUser();
  const roles = useMyGroupRoles();
  const [chosen, setChosen] = useState<string | null>(null);
  const choices = nextForms(step.form_definition);

  let body;
  if (step.form_next_id !== null && step.form_next_id !== undefined) {
    body = <p className="text-ink-muted">{t("requestDetail.decided")}</p>;
  } else if (choices.length === 0) {
    body = <p className="text-ink-muted">{t("requestDetail.noSuccessor")}</p>;
  } else if (user.isPending || roles.isPending) {
    body = <p className="text-ink-muted">{t("detail.loading")}</p>;
  } else if (
    user.data === undefined ||
    roles.data === undefined ||
    !isAssignedTo(step.form_assignee, { name: user.data.name, roles: roles.data })
  ) {
    body = (
      <p className="text-ink-muted">
        {t("requestDetail.notAssigned", { who: step.form_assignee?.trim() ?? "" })}
      </p>
    );
  } else if (chosen === null) {
    body = (
      <>
        <p className="text-ink-muted">{t("requestDetail.choose")}</p>
        <ul className="flex flex-col gap-2">
          {choices.map((name) => (
            <li key={name}>
              <Choice
                name={name}
                onChoose={() => {
                  setChosen(name);
                }}
              />
            </li>
          ))}
        </ul>
      </>
    );
  } else {
    body = (
      <NextStepForm
        name={chosen}
        prevId={step.id ?? 0}
        workflowId={workflowId}
        headId={headId}
        onCancel={() => {
          setChosen(null);
        }}
        onDecided={onDecided}
      />
    );
  }

  return <DecisionBox>{body}</DecisionBox>;
}

/** One of the next forms, as a choice: its label and its description. */
function Choice({ name, onChoose }: { name: string; onChoose: () => void }) {
  const form = useSubmittableForm(name);
  const def = parseDefinition(form.data?.definition);
  const { t } = useTranslation();
  const missing = !form.isPending && form.data === null;
  return (
    <button
      type="button"
      disabled={form.isPending || missing}
      onClick={onChoose}
      className="flex w-full flex-col items-start gap-0.5 rounded-(--radius-control) border border-line bg-surface-raised px-3 py-2 text-left hover:border-accent disabled:opacity-60"
    >
      <span className="font-medium">{def?.label || name}</span>
      {missing ? (
        <span className="text-state-warn">▲ {t("requestDetail.formUnavailable", { name })}</span>
      ) : (
        def?.desc !== undefined &&
        def.desc !== "" && <span className="text-ink-muted">{def.desc}</span>
      )}
    </button>
  );
}

/** The chosen next form, filled in and submitted as the next step of the request. */
function NextStepForm({
  name,
  prevId,
  workflowId,
  headId,
  onCancel,
  onDecided,
}: {
  name: string;
  prevId: number;
  workflowId: string;
  headId: number | undefined;
  onCancel: () => void;
  onDecided: (outcome: Outcome) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useFormUser();
  const form = useSubmittableForm(name);
  const def = useMemo(() => parseDefinition(form.data?.definition), [form.data]);
  const submit = useMutation({
    mutationFn: async (data: unknown) => {
      const { data: results, error } = await api.PUT("/forms/{form_id}", {
        params: { path: { form_id: form.data?.id ?? 0 } },
        body: { data, prev_wfid: prevId },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return results as unknown;
    },
    onSuccess: (results) => {
      onDecided({
        label: def?.label || name,
        resultsId:
          isRecord(results) && typeof results.results_id === "number" ? results.results_id : null,
        results,
      });
      // The lists and the request read again: the step has moved on.
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
      void queryClient.invalidateQueries({ queryKey: ["workflow-steps", headId] });
    },
  });

  if (form.isPending || user.isPending)
    return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (form.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {form.error.message}
      </p>
    );
  if (def === null || user.data === undefined)
    return <p className="text-state-warn">▲ {t("requestDetail.formUnavailable", { name })}</p>;

  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">{def.label || name}</p>
      {def.desc !== "" && <p className="text-ink-muted">{def.desc}</p>}
      <FormRender
        def={def}
        formId={form.data?.id}
        user={user.data}
        onSubmit={(data) => {
          submit.mutate(data);
        }}
        submitLabel={submit.isPending ? t("requests.submitting") : t("requestDetail.submit")}
        secondaryAction={
          <button
            type="button"
            onClick={onCancel}
            disabled={submit.isPending}
            className="h-8 rounded-(--radius-control) border border-line px-3"
          >
            {t("requestDetail.back")}
          </button>
        }
      />
      {submit.isError && (
        <p role="alert" className="text-state-down">
          ■ {submit.error.message}
        </p>
      )}
    </div>
  );
}
