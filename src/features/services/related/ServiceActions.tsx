import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import { AnsiText } from "@/components/ui/AnsiText";
import { DateTime } from "@/components/ui/DateTime";
import { ClockIcon, CloseIcon } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format";
import { actionState } from "./action-status";
import {
  SERVICE_ACTIONS_DAYS,
  SERVICE_ACTIONS_LIMIT,
  useServiceActionLog,
  useServiceActions,
  type ServiceAction,
} from "./queries";

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

  const columns: RelatedColumn<ServiceAction>[] = [
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
          {row.cron === 1 && (
            <span title={t("services.actions.scheduled")} className="text-ink-muted">
              <ClockIcon className="h-3.5 w-3.5" />
              <span className="sr-only">{t("services.actions.scheduled")}</span>
            </span>
          )}
          <span>{row.action}</span>
          <ActionTargets subset={row.subset} rid={row.rid} />
        </span>
      ),
    },
    {
      key: "status",
      label: t("services.actions.fields.status"),
      render: (row) => {
        const { state, labelKey } = actionState(row.status);
        return <StatusBadge state={state} label={t(labelKey)} />;
      },
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
          svcId={svcId}
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

/** Resource ids named in full; past them, counted, the whole list in a tooltip. */
const TARGETS_SHOWN = 2;

/**
 * What an action was limited to: its subset and its resources. The agent lists
 * the resources separated by commas, a dozen at times: the first ones are named,
 * the others counted, so that the column keeps its width.
 */
function ActionTargets({
  subset,
  rid,
}: {
  subset: string | null | undefined;
  rid: string | null | undefined;
}) {
  const rids = (rid ?? "").split(",").filter((item) => item !== "");
  const parts = [
    ...(subset === null || subset === undefined || subset === "" ? [] : [subset]),
    ...rids,
  ];
  if (parts.length === 0) return null;
  const shown = parts.slice(0, TARGETS_SHOWN).join(", ");
  const more = parts.length - TARGETS_SHOWN;
  return (
    <span className="text-ink-muted" title={more > 0 ? parts.join(", ") : undefined}>
      {shown}
      {more > 0 && ` +${String(more)}`}
    </span>
  );
}

/** The log lines of an action, as the agent wrote them, its colours rendered. */
function ActionLog({
  svcId,
  action,
  locale,
  onClose,
}: {
  svcId: string;
  action: ServiceAction;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const log = useServiceActionLog(svcId, action);
  const lines = log.data ?? [];
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
      {log.isPending && <p className="text-ink-muted">{t("detail.loading")}</p>}
      {log.isError && (
        <p role="alert" className="text-state-down">
          ■ {log.error.message}
        </p>
      )}
      {log.isSuccess && lines.length === 0 && (
        <p className="text-ink-muted">{t("services.actions.noLog")}</p>
      )}
      {lines.length > 0 && (
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
      )}
    </section>
  );
}
