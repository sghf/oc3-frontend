import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { AnsiText } from "@/components/ui/AnsiText";
import { ClockIcon } from "@/components/ui/icons";
import { StatusBadge } from "./StatusBadge";
import { TARGETS_SHOWN, actionState, actionTargets, type AgentAction } from "./agent-action";

/** The status of an action, its shape and its word. */
export function ActionStatus({ status }: { status: string | null | undefined }) {
  const { t } = useTranslation();
  const { state, labelKey } = actionState(status);
  return <StatusBadge state={state} label={t(labelKey)} />;
}

/** A clock when the scheduler of the agent ran the action, rather than a user. */
export function ScheduledMark({ cron }: { cron: number | null | undefined }) {
  const { t } = useTranslation();
  if (cron !== 1) return null;
  return (
    <span title={t("agentActions.scheduled")} className="text-ink-muted">
      <ClockIcon className="h-3.5 w-3.5" />
      <span className="sr-only">{t("agentActions.scheduled")}</span>
    </span>
  );
}

/**
 * What an action was limited to: its subset and its resources. The agent lists
 * the resources separated by commas, a dozen at times: the first ones are named,
 * the others counted, so that a column keeps its width.
 */
export function ActionTargets({
  subset,
  rid,
}: {
  subset: string | null | undefined;
  rid: string | null | undefined;
}) {
  const parts = actionTargets(subset, rid);
  if (parts.length === 0) return null;
  const more = parts.length - TARGETS_SHOWN;
  return (
    <span className="text-ink-muted" title={more > 0 ? parts.join(", ") : undefined}>
      {parts.slice(0, TARGETS_SHOWN).join(", ")}
      {more > 0 && ` +${String(more)}`}
    </span>
  );
}

/**
 * The log lines of an action: the rows of the same service, node, agent session
 * and process that are not an action, in the order the agent wrote them, its
 * colours rendered.
 */
export function ActionLogLines({ action }: { action: AgentAction }) {
  const { t } = useTranslation();
  const log = useQuery({
    queryKey: ["agentAction", action.id, "log"],
    queryFn: async () => {
      const filter = [
        "log_type:empty",
        `svc_id:eq:${action.svc_id ?? ""}`,
        `node_id:eq:${action.node_id ?? ""}`,
      ];
      if (action.sid !== undefined && action.sid !== null && action.sid !== "")
        filter.push(`sid:eq:${action.sid}`);
      if (action.pid !== undefined && action.pid !== null && action.pid !== "")
        filter.push(`pid:eq:${action.pid}`);
      const { data, error } = await api.GET("/services_actions", {
        params: {
          query: { props: "id,begin,rid,status,status_log", orderby: "begin,id", limit: 0, filter },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: AgentAction[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
  const lines = log.data ?? [];
  if (log.isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (log.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {log.error.message}
      </p>
    );
  if (lines.length === 0) return <p className="text-ink-muted">{t("agentActions.noLog")}</p>;
  return (
    <ol className="max-h-96 overflow-auto rounded-(--radius-control) bg-surface-sunken p-2 text-data">
      {lines.map((line) => {
        const { state, labelKey } = actionState(line.status);
        return (
          <li key={line.id} className="flex items-start gap-2 py-0.5">
            <span className="shrink-0 text-ink-muted tabular-nums">
              {(line.begin ?? "").slice(11)}
            </span>
            {line.status !== null && line.status !== undefined && line.status !== "" && (
              <StatusBadge state={state} label={t(labelKey)} className="w-auto shrink-0" />
            )}
            {line.rid !== null && line.rid !== undefined && line.rid !== "" && (
              <span className="shrink-0 text-ink-muted">{line.rid}</span>
            )}
            <span className="min-w-0 break-words whitespace-pre-wrap">
              <AnsiText text={line.status_log ?? ""} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
