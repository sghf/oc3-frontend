import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { ActionStatus, ActionTargets, ScheduledMark } from "@/components/opensvc/AgentActionParts";
import { actionDuration, type AgentAction } from "@/components/opensvc/agent-action";
import { DateTime } from "@/components/ui/DateTime";
import { formatDuration } from "@/lib/format";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey, type ColumnFilters } from "@/lib/column-filters";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { ActionAckMenu } from "./ActionAckMenu";
import { ServiceActionDetailPanel } from "./ServiceActionDetailPanel";
import { actionName } from "./action-name";

/** The latest first, as the historical view. */
const DEFAULT_SORT = ["-begin"];

/**
 * The actions themselves, never their log lines (`log_type` ""), which the detail
 * of an action shows: applied to every request of the view, apart from the
 * filters the user sets.
 */
const ACTIONS_ONLY = "log_type:eq:status";

/** The columns of the historical actions view (`table_actions`), on the action itself. */
const ACTION_PROPS = [
  "id",
  "services.svcname",
  "nodes.nodename",
  "action",
  "rid",
  "status",
  "begin",
  "end",
  "time",
  "cron",
  "sid",
  "pid",
  "subset",
  "command",
  "origin",
  "version",
  "ack",
  "acked_by",
  "acked_date",
  "acked_comment",
  "svc_id",
  "node_id",
] as const satisfies readonly (keyof AgentAction)[];

type ActionProp = (typeof ACTION_PROPS)[number];

/** As the default columns of the historical view. */
const DEFAULT_COLS: string[] = [
  "services.svcname",
  "nodes.nodename",
  "action",
  "rid",
  "status",
  "begin",
  "time",
];

const FAMILY: Record<ActionProp, ColumnFamily> = {
  id: "service",
  "services.svcname": "service",
  svc_id: "service",
  "nodes.nodename": "node",
  node_id: "node",
  action: "service",
  rid: "resource",
  subset: "resource",
  command: "service",
  origin: "service",
  version: "service",
  status: "state",
  begin: "time",
  end: "time",
  time: "time",
  cron: "time",
  sid: "service",
  pid: "service",
  ack: "alert",
  acked_by: "alert",
  acked_date: "time",
  acked_comment: "alert",
};

const STATUS_OPTIONS: ColumnFilterOption[] = [
  { value: "ok", labelKey: "agentActions.statusNames.ok" },
  { value: "warn", labelKey: "agentActions.statusNames.warn" },
  { value: "err", labelKey: "agentActions.statusNames.err" },
];

/** The 0 / 1 flags of the table, offered by their meaning. */
const FLAG_OPTIONS: ColumnFilterOption[] = [
  { value: "1", labelKey: "detail.yes" },
  { value: "0", labelKey: "detail.no" },
];

const COLUMNS: ListColumn<AgentAction>[] = ACTION_PROPS.map((prop) => ({
  prop,
  labelKey: `serviceActions.fields.${prop}`,
  numeric: prop === "id" || prop === "time",
  family: FAMILY[prop],
  filter:
    prop === "status"
      ? { kind: "enum" as const, options: STATUS_OPTIONS }
      : prop === "cron" || prop === "ack"
        ? { kind: "enum" as const, options: FLAG_OPTIONS }
        : undefined,
  render: (row: AgentAction, locale: string) => {
    const value = row[prop];
    if (prop === "services.svcname")
      return (
        <CrossLink kind="service" id={row.svc_id}>
          {value}
        </CrossLink>
      );
    if (prop === "nodes.nodename")
      return value === null || value === undefined ? (
        row.node_id
      ) : (
        <CrossLink kind="node" id={row.node_id ?? undefined}>
          {value}
        </CrossLink>
      );
    if (prop === "action")
      return (
        <span className="flex items-center gap-1.5">
          <ScheduledMark cron={row.cron} />
          {value}
        </span>
      );
    if (prop === "rid") return <ActionTargets subset={undefined} rid={row.rid} />;
    if (prop === "status") return <ActionStatus status={row.status} />;
    if ((prop === "begin" || prop === "end" || prop === "acked_date") && typeof value === "string")
      return <DateTime value={value} />;
    if (prop === "time") {
      const seconds = actionDuration(row);
      return seconds === undefined ? null : formatDuration(seconds, locale);
    }
    if (prop === "cron" || prop === "ack") return <FlagWord value={value} />;
    if (prop === "command" && typeof value === "string")
      return (
        <code className="block max-w-md truncate text-data" title={value}>
          {value}
        </code>
      );
    return value;
  },
}));

/** A 0 / 1 flag in words, "no" muted. */
function FlagWord({ value }: { value: unknown }) {
  const { t } = useTranslation();
  if (value !== 0 && value !== 1) return null;
  return (
    <span className={value === 1 ? "" : "text-ink-muted"}>
      {t(value === 1 ? "detail.yes" : "detail.no")}
    </span>
  );
}

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/**
 * Columns shown, plus the ids the detail and the links need, the scheduler mark,
 * and the status and acknowledgement that tell the rows one may acknowledge.
 */
function queryProps(cols: string[] | undefined): string {
  return [
    ...new Set([
      "id",
      "svc_id",
      "node_id",
      "cron",
      "status",
      "ack",
      ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS),
    ]),
  ].join(",");
}

/** Whether an action is a failure not acknowledged yet: the only ones to acknowledge. */
function acknowledgeable(row: AgentAction): boolean {
  return row.status === "err" && row.ack !== 1;
}

/** The filters of a request: those of the user, and the actions only. */
function requestFilters(filters: ColumnFilters): string[] {
  return [...(filterQuery(filters) ?? []), ACTIONS_ONLY];
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchActions(search: ResolvedListSearch) {
  // One row more than the page: whether another page follows.
  const { data, error } = await api.GET("/services_actions", {
    params: {
      query: {
        props: queryProps(search.cols),
        orderby: search.sort.join(","),
        offset: search.offset,
        limit: search.limit + 1,
        filter: requestFilters(search.filters),
      },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  const all: AgentAction[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

/** The distribution of a column's values over the actions, with the filters given. */
async function actionStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const { data, error } = await api.GET("/services_actions", {
    params: {
      query: { props: prop, stats: "1", limit: STATS_LIMIT, filter: requestFilters(filters) },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  return toValueStats(data.data, data.meta, prop);
}

function useActions(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "serviceActions",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchActions(search),
  });
}

/**
 * The actions the agents ran on the services: the historical `view-actions`
 * (`svcactions`), apart from the action queue, which lists what the collector asks
 * the agents to do. Each row is an action, its log lines in its detail. A Manager
 * sees them all, the others those of the services of an app their teams are
 * responsible for. An action is described by its agent: the only change is the
 * acknowledgement of a failure, on the rows checked or in the detail.
 */
export function ServiceActionsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("serviceActions");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/service-actions" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/service-actions" });
  const { data, isPending, isError, error, isFetching } = useActions(search);
  // The rows checked, to acknowledge them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // The failures not acknowledged among the rows of a selection extended to every
  // page, read with their ids; those on display are known from their rows.
  const [unackedBeyond, setUnackedBeyond] = useState<ReadonlySet<string>>(new Set());
  // Names from the page on display: a selection extended to the following pages does
  // not have them all, so the id then serves as a fallback in the messages.
  const names = new Map<string, string>();
  for (const row of data?.rows ?? []) {
    if (row.id !== undefined) names.set(String(row.id), actionName(row));
  }
  const onPage = new Map((data?.rows ?? []).map((row) => [String(row.id), acknowledgeable(row)]));
  // Only the failures not acknowledged: an action that succeeded, or acknowledged
  // already, has nothing to acknowledge, and is not offered.
  const toAcknowledge = selectedIds.filter((id) => onPage.get(id) ?? unackedBeyond.has(id));

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/services_actions", {
      params: {
        query: { props: "id,status,ack", limit: 0, filter: requestFilters(search.filters) },
      },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: AgentAction[] = Array.isArray(data.data) ? data.data : [];
    setUnackedBeyond(
      new Set(
        rows
          .filter(acknowledgeable)
          .flatMap((row) => (row.id === undefined ? [] : [String(row.id)])),
      ),
    );
    return rows.flatMap((row) => (row.id === undefined ? [] : [String(row.id)]));
  }

  function update(next: Partial<ResolvedListSearch>) {
    // Columns, sort, filters and page size follow the account, the other states
    // stay in the URL.
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  const selected = data?.rows.find((row) => String(row.id) === search.sel);

  return (
    <section>
      {/* As tall as the Actions button from the start: checking a row must not push the list down. */}
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="action" className="h-5 w-5" />
          {t("serviceActions.title")}
        </h1>
        {/* On the rows checked in the list; nothing checked, no menu. */}
        <ActionAckMenu actions={toAcknowledge.map((id) => ({ id, name: names.get(id) ?? id }))} />
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("serviceActions.intro")}</p>

      <CollectorList
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchActions({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        onSelectionChange={setSelectedIds}
        valueStats={actionStats}
        filterable
      />

      <ServiceActionDetailPanel
        actionId={search.sel}
        label={selected === undefined ? "" : actionName(selected)}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
