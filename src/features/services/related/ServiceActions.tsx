import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import {
  ActionLogLines,
  ActionStatus,
  ActionTargets,
  ScheduledMark,
} from "@/components/opensvc/AgentActionParts";
import { actionDuration, type AgentAction } from "@/components/opensvc/agent-action";
import { DateTime } from "@/components/ui/DateTime";
import { CloseIcon } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format";
import {
  SERVICE_ACTIONS_DEFAULT_DAYS,
  SERVICE_ACTIONS_LIMIT,
  SERVICE_ACTIONS_PERIODS,
  SERVICE_ACTIONS_TIMELINE_LIMIT,
  useServiceActions,
} from "./queries";
import { ServiceActionsTimeline } from "./ServiceActionsTimeline";

/**
 * The actions the agents ran on a service over a period chosen at the top (a day,
 * a week, a month, two), as the historical service actions tab
 * (`table_actions_svc`) and its timeline: the timeline draws every action of the
 * period by node and status; the list shows the latest, with when, on which node,
 * which action and on which resources, its status, its duration, whether the
 * agent's scheduler ran it, and the acknowledgement of a failure. Selecting an
 * action, from either, outlines it in the timeline and shows under the list the
 * lines the agent wrote during it.
 */
export function ServiceActions({
  svcId,
  nodeId,
  locale,
}: {
  svcId: string;
  /** The node of an instance: its actions only, without the node column. */
  nodeId?: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(SERVICE_ACTIONS_DEFAULT_DAYS);
  const actions = useServiceActions(svcId, days, nodeId);
  const all = actions.data?.rows ?? [];
  const rows = all.slice(0, SERVICE_ACTIONS_LIMIT);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const selected = all.find((row) => row.id === selectedId);

  const allColumns: RelatedColumn<AgentAction>[] = [
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
      render: (row) => {
        const seconds = actionDuration(row);
        return seconds === undefined ? null : formatDuration(seconds, locale);
      },
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

  // An instance names its node already.
  const columns =
    nodeId === undefined
      ? allColumns
      : allColumns.filter((column) => column.key !== "nodes.nodename");

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label={t("services.actions.period.label")}
        className="flex flex-wrap gap-1"
      >
        {SERVICE_ACTIONS_PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            role="radio"
            aria-checked={days === period}
            onClick={() => {
              setDays(period);
            }}
            className="h-7 rounded-(--radius-control) border border-line px-2 aria-checked:border-accent aria-checked:bg-accent-soft aria-checked:font-medium"
          >
            {t(`services.actions.period.days`, { count: period })}
          </button>
        ))}
      </div>
      {all.length > 0 && (
        <ServiceActionsTimeline
          actions={all}
          days={days}
          locale={locale}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id === selectedId ? undefined : id);
          }}
        />
      )}
      {actions.data?.hasMore === true && (
        <p className="text-state-warn">
          ▲ {t("services.actions.timeline.capped", { count: SERVICE_ACTIONS_TIMELINE_LIMIT })}
        </p>
      )}
      <RelatedTable
        columns={columns}
        groups={[{ key: "all", label: "", rows }]}
        rowKey={(row) => String(row.id)}
        isPending={actions.isPending}
        errorMessage={actions.isError ? actions.error.message : null}
        empty={t("services.actions.empty", { count: days })}
        caption={t("services.related.actions")}
      />
      {rows.length > 0 && (
        <p className="text-ink-muted">
          {all.length > rows.length
            ? t("services.actions.latest", {
                count: rows.length,
                total:
                  actions.data?.hasMore === true ? (actions.data.total ?? all.length) : all.length,
                days,
              })
            : t("services.actions.periodNote", { count: days })}
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
  const section = useRef<HTMLElement>(null);
  // Chosen from the timeline, the log may open below the fold.
  useEffect(() => {
    section.current?.scrollIntoView({ block: "nearest" });
  }, [action.id]);
  return (
    <section
      ref={section}
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
