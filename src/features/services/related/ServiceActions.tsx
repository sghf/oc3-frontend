import { useState, type ReactNode } from "react";
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
import { TableIcon, TimelineIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { formatDuration } from "@/lib/format";
import {
  SERVICE_ACTIONS_DEFAULT_DAYS,
  SERVICE_ACTIONS_LIMIT,
  SERVICE_ACTIONS_PERIODS,
  SERVICE_ACTIONS_TIMELINE_LIMIT,
  useNodeActions,
  useNodeUnackedActionErrors,
  useServiceActions,
  useUnackedActionErrors,
} from "./queries";
import { ActionAckMenu } from "@/features/service-actions/ActionAckMenu";
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
 *
 * Without `svcId`, the actions of the node `nodeId`, of every service, as the
 * historical node actions tab (`table_actions_node`): a service column in place of
 * the node's, a timeline track per service.
 */
export function ServiceActions({
  svcId,
  nodeId,
  locale,
}: {
  /** The service; none for the actions of the node `nodeId`, of every service. */
  svcId?: string;
  /** The node of an instance, or the node of the tab: its actions only, without the node column. */
  nodeId?: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(SERVICE_ACTIONS_DEFAULT_DAYS);
  const ofNode = svcId === undefined;
  // Both asked, one of them only enabled: hooks are called whatever the scope.
  const serviceActions = useServiceActions(svcId, days, nodeId);
  const nodeActions = useNodeActions(ofNode ? nodeId : undefined, days);
  const actions = ofNode ? nodeActions : serviceActions;
  const serviceUnacked = useUnackedActionErrors(svcId, nodeId);
  const nodeUnacked = useNodeUnackedActionErrors(ofNode ? nodeId : undefined);
  const unacked = ofNode ? nodeUnacked : serviceUnacked;
  const unackedCount = unacked.data?.length ?? 0;
  const all = actions.data?.rows ?? [];
  const rows = all.slice(0, SERVICE_ACTIONS_LIMIT);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  // A node's actions show as a timeline or as a table, one at a time: with a
  // track per service, both at once fill the panel.
  const [view, setView] = useState<ActionsView>("timeline");
  const showTimeline = !ofNode || view === "timeline";
  const showTable = !ofNode || view === "table";
  const selected = all.find((row) => row.id === selectedId);

  const allColumns: RelatedColumn<AgentAction>[] = [
    {
      key: "begin",
      label: t("services.actions.fields.begin"),
      render: (row) => <DateTime value={row.begin} />,
    },
    {
      key: "services.svcname",
      label: t("services.actions.fields.service"),
      render: (row) => (
        <CrossLink kind="service" id={row.svc_id}>
          {row["services.svcname"] ?? row.svc_id}
        </CrossLink>
      ),
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
      // Its targets wrap: with the service column of a node, the table would
      // otherwise widen the panel.
      wrap: true,
      render: (row) => (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
            {t("services.actions.acked", {
              // An address may break after its @ rather than hold the column wide.
              by: (row.acked_by ?? "").replace("@", "@\u200b"),
            })}
          </span>
        ) : null,
    },
  ];

  // An instance, or a node, names its node already; a service, its service.
  const columns = allColumns.filter(
    (column) =>
      !(column.key === "nodes.nodename" && nodeId !== undefined) &&
      !(column.key === "services.svcname" && !ofNode),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
        {ofNode && (
          <SegmentedToggle
            options={[
              { value: "timeline", label: t("services.actions.view.timeline"), icon: TimelineIcon },
              { value: "table", label: t("services.actions.view.table"), icon: TableIcon },
            ]}
            value={view}
            onChange={setView}
            label={t("services.actions.view.label")}
          />
        )}
      </div>
      {/* The failures nobody acknowledged yet, all dates, and their acknowledgement:
          the menu stays once they are, for its report. */}
      <div className="flex flex-wrap items-center gap-3 empty:hidden">
        {unackedCount > 0 && (
          <p className="text-state-down">
            ■ {t("services.actions.unacked", { count: unackedCount })}
          </p>
        )}
        <ActionAckMenu
          actions={(unacked.data ?? []).flatMap((row) =>
            row.id === undefined
              ? []
              : [
                  {
                    id: String(row.id),
                    name: [
                      row.action,
                      ofNode ? row["services.svcname"] : row["nodes.nodename"],
                      row.begin,
                    ]
                      .filter((part) => part !== undefined && part !== null && part !== "")
                      .join(" · "),
                  },
                ],
          )}
        />
      </div>
      {showTimeline && all.length > 0 && (
        <ServiceActionsTimeline
          actions={all}
          trackBy={ofNode ? "service" : "node"}
          days={days}
          locale={locale}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id === selectedId ? undefined : id);
          }}
        />
      )}
      {showTimeline && actions.data?.hasMore === true && (
        <p className="text-state-warn">
          ▲ {t("services.actions.timeline.capped", { count: SERVICE_ACTIONS_TIMELINE_LIMIT })}
        </p>
      )}
      {showTable && (
        <RelatedTable
          columns={columns}
          groups={[{ key: "all", label: "", rows }]}
          rowKey={(row) => String(row.id)}
          isPending={actions.isPending}
          errorMessage={actions.isError ? actions.error.message : null}
          empty={t("services.actions.empty", { count: days })}
          caption={t("services.related.actions")}
          onRowOpen={(row) => {
            setSelectedId(row.id);
          }}
        />
      )}
      {showTable && rows.length > 0 && (
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
        // Chosen on the timeline or in the table: its details in a window.
        <Modal
          title={t("services.actions.logTitle", { action: selected.action ?? "" })}
          closeLabel={t("detail.close")}
          onClose={() => {
            setSelectedId(undefined);
          }}
        >
          <ActionFacts action={selected} ofNode={ofNode} locale={locale} />
          <ActionLogBody action={selected} />
        </Modal>
      )}
    </div>
  );
}

type ActionsView = "timeline" | "table";

/** The command of an action and its log lines. */
function ActionLogBody({ action }: { action: AgentAction }) {
  return (
    <>
      {action.command !== undefined && action.command !== null && action.command !== "" && (
        <p className="mb-2 text-data text-ink-muted">
          <code>{action.command}</code>
        </p>
      )}
      <ActionLogLines action={action} />
    </>
  );
}

/** What the table row of an action tells, for an action chosen on the timeline. */
function ActionFacts({
  action,
  ofNode,
  locale,
}: {
  action: AgentAction;
  ofNode: boolean;
  locale: string;
}) {
  const { t } = useTranslation();
  const seconds = actionDuration(action);
  const facts: [string, ReactNode][] = [
    [
      t(ofNode ? "services.actions.fields.service" : "services.actions.fields.node"),
      ofNode ? (
        <CrossLink kind="service" id={action.svc_id}>
          {action["services.svcname"] ?? action.svc_id}
        </CrossLink>
      ) : (
        <CrossLink kind="node" id={action.node_id}>
          {action["nodes.nodename"] ?? action.node_id}
        </CrossLink>
      ),
    ],
    [t("services.actions.fields.status"), <ActionStatus key="status" status={action.status} />],
    [t("services.actions.fields.begin"), <DateTime key="begin" value={action.begin} />],
    [
      t("services.actions.timeline.end"),
      action.end === undefined || action.end === null ? (
        t("services.actions.timeline.ongoing")
      ) : (
        <DateTime key="end" value={action.end} />
      ),
    ],
    [
      t("services.actions.fields.time"),
      seconds === undefined ? "—" : formatDuration(seconds, locale),
    ],
    [
      t("services.actions.fields.ack"),
      action.ack === 1 ? t("services.actions.acked", { by: action.acked_by ?? "" }) : "—",
    ],
  ];
  return (
    <dl className="mb-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
