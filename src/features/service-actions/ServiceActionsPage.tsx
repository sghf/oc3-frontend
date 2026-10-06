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
import type { AgentAction } from "@/components/opensvc/agent-action";
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

/** Columns with one value per action: their distribution would list each once. */
const UNIQUE_PROPS = new Set<string>(["id", "sid", "pid"]);

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
  distribution: UNIQUE_PROPS.has(prop) ? false : undefined,
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
      return <DateTime value={value} locale={locale} />;
    if (prop === "time" && typeof value === "number") return formatDuration(value, locale);
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

/** Columns shown, plus the ids the detail and the links need, and the scheduler mark. */
function queryProps(cols: string[] | undefined): string {
  return [
    ...new Set(["id", "svc_id", "node_id", "cron", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)]),
  ].join(",");
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
 * responsible for. Read-only: an action is described by its agent.
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

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/services_actions", {
      params: { query: { props: "id", limit: 0, filter: requestFilters(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: AgentAction[] = Array.isArray(data.data) ? data.data : [];
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
      <h1 className="mb-3 flex items-center gap-2 text-title font-semibold">
        <ObjectIcon kind="action" className="h-5 w-5" />
        {t("serviceActions.title")}
      </h1>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("serviceActions.intro")}</p>

      <CollectorList
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
        search={search}
        onChange={update}
        // apicollector has no actions endpoint filtered by filterset; the session
        // filter narrows the list.
        filtersets={[]}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchActions({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
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
