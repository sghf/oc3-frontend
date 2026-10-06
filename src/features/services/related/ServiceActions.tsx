import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import {
  ActionLogLines,
  ActionStatus,
  ActionTargets,
  ScheduledMark,
} from "@/components/opensvc/AgentActionParts";
import type { AgentAction } from "@/components/opensvc/agent-action";
import { DateTime } from "@/components/ui/DateTime";
import { CloseIcon } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format";
import { SERVICE_ACTIONS_DAYS, SERVICE_ACTIONS_LIMIT, useServiceActions } from "./queries";

/**
 * The actions the agents ran on a service over the last `SERVICE_ACTIONS_DAYS`
 * days, the latest first, as the historical service actions tab
 * (`table_actions_svc`): when, on which node, which action and on which
 * resources, its status, its duration, whether the agent's scheduler ran it, and
 * the acknowledgement of a failure. "Log" shows the lines the agent wrote during
 * the action, under the list.
 */
export function ServiceActions({ svcId, locale }: { svcId: string; locale: string }) {
  const { t } = useTranslation();
  const actions = useServiceActions(svcId);
  const rows = actions.data?.rows ?? [];
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const selected = rows.find((row) => row.id === selectedId);

  const columns: RelatedColumn<AgentAction>[] = [
    {
      key: "begin",
      label: t("services.actions.fields.begin"),
      render: (row) => <DateTime value={row.begin} locale={locale} />,
    },
    {
      key: "nodes.nodename",
      label: t("services.actions.fields.node"),
      render: (row) =>
        row["nodes.nodename"] === null || row["nodes.nodename"] === undefined ? (
          row.node_id
        ) : (
          <CrossLink kind="node" id={row.node_id}>
            {row["nodes.nodename"]}
          </CrossLink>
        ),
    },
    {
      key: "action",
      label: t("services.actions.fields.action"),
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <ScheduledMark cron={row.cron} />
          <span>{row.action}</span>
          <ActionTargets subset={row.subset} rid={row.rid} />
        </span>
      ),
    },
    {
      key: "status",
      label: t("services.actions.fields.status"),
      render: (row) => <ActionStatus status={row.status} />,
    },
    {
      key: "time",
      label: t("services.actions.fields.time"),
      numeric: true,
      render: (row) =>
        row.time === null || row.time === undefined ? null : formatDuration(row.time, locale),
    },
    {
      key: "ack",
      label: t("services.actions.fields.ack"),
      grow: true,
      render: (row) =>
        row.ack === 1 ? (
          <span title={row.acked_comment ?? undefined}>
            {t("services.actions.acked", { by: row.acked_by ?? "" })}
          </span>
        ) : null,
    },
    {
      key: "log",
      label: t("services.actions.fields.log"),
      render: (row) => (
        <button
          type="button"
          aria-pressed={row.id === selectedId}
          onClick={() => {
            setSelectedId(row.id === selectedId ? undefined : row.id);
          }}
          className="h-6 rounded-(--radius-control) border border-line px-1.5 text-ink-muted hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-ink"
        >
          {t("services.actions.showLog")}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <RelatedTable
        columns={columns}
        groups={[{ key: "all", label: "", rows }]}
        rowKey={(row) => String(row.id)}
        isPending={actions.isPending}
        errorMessage={actions.isError ? actions.error.message : null}
        empty={t("services.actions.empty", { days: SERVICE_ACTIONS_DAYS })}
        caption={t("services.related.actions")}
      />
      {rows.length > 0 && (
        <p className="text-ink-muted">
          {actions.data?.hasMore === true
            ? t("services.actions.latest", {
                count: SERVICE_ACTIONS_LIMIT,
                total: actions.data.total ?? SERVICE_ACTIONS_LIMIT,
                days: SERVICE_ACTIONS_DAYS,
              })
            : t("services.actions.period", { days: SERVICE_ACTIONS_DAYS })}
        </p>
      )}
      {selected !== undefined && (
        <ActionLog
          action={selected}
          locale={locale}
          onClose={() => {
            setSelectedId(undefined);
          }}
        />
      )}
    </div>
  );
}

/** The log lines of an action, as the agent wrote them, its colours rendered. */
function ActionLog({
  action,
  locale,
  onClose,
}: {
  action: AgentAction;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("services.actions.logTitle", { action: action.action ?? "" })}
      className="rounded-(--radius-panel) border border-line bg-surface-raised p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-semibold">
          {t("services.actions.logTitle", { action: action.action ?? "" })}
        </h3>
        <span className="text-ink-muted">
          {action["nodes.nodename"] ?? action.node_id} ·{" "}
          <DateTime value={action.begin} locale={locale} />
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("detail.close")}
          title={t("detail.close")}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-(--radius-control) text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {action.command !== undefined && action.command !== null && action.command !== "" && (
        <p className="mb-2 text-data text-ink-muted">
          <code>{action.command}</code>
        </p>
      )}
      <ActionLogLines action={action} />
    </section>
  );
}
