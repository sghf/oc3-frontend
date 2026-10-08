import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { StatusBadge, type ObjectState } from "@/components/opensvc/StatusBadge";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { DateTime } from "@/components/ui/DateTime";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey, type ColumnFilters } from "@/lib/column-filters";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";

type ComplianceLogRow = components["schemas"]["ComplianceLogRow"];

/** The most recent first, as the historical table (`~id`). */
const DEFAULT_SORT = ["-id"];

/**
 * Props exposed by apicollector, joined names included, in the order of the
 * historical table. `satisfies` confronts them with the generated schema.
 */
const LOG_PROPS = [
  "id",
  "run_date",
  "node_id",
  "nodes.nodename",
  "svc_id",
  "services.svcname",
  "run_module",
  "run_action",
  "run_status",
  "run_log",
  "rset_md5",
] as const satisfies readonly (keyof ComplianceLogRow)[];

type LogProp = (typeof LOG_PROPS)[number];

/** The default columns of the historical table, in its column order. */
const DEFAULT_COLS: string[] = [
  "run_date",
  "nodes.nodename",
  "services.svcname",
  "run_module",
  "run_action",
  "run_status",
];

const FAMILY: Record<LogProp, ColumnFamily> = {
  id: "state",
  run_date: "time",
  node_id: "node",
  "nodes.nodename": "node",
  svc_id: "service",
  "services.svcname": "service",
  run_module: "moduleset",
  run_action: "moduleset",
  run_status: "state",
  run_log: "alert",
  rset_md5: "ruleset",
};

/**
 * Exit codes of a module run, as the historical cells tell them: 0 ok, 1 not ok,
 * 2 not applicable, -15 killed; any other code is shown as is.
 */
const RUN_STATUSES: Record<string, { state: ObjectState; labelKey: string }> = {
  "0": { state: "up", labelKey: "complianceLogs.status.ok" },
  "1": { state: "down", labelKey: "complianceLogs.status.nok" },
  "2": { state: "unknown", labelKey: "complianceLogs.status.na" },
  "-15": { state: "warn", labelKey: "complianceLogs.status.killed" },
};

const STATUS_OPTIONS: ColumnFilterOption[] = Object.entries(RUN_STATUSES).map(
  ([value, { labelKey }]) => ({ value, labelKey }),
);

/** The actions a module runs; the values are their own labels, as in the cells. */
const ACTION_OPTIONS: ColumnFilterOption[] = [
  { value: "check" },
  { value: "fixable" },
  { value: "fix" },
];

function RunStatus({ value }: { value: number | undefined }) {
  const { t } = useTranslation();
  if (value === undefined) return null;
  const known = RUN_STATUSES[String(value)];
  return known === undefined ? (
    <StatusBadge state="unknown" label={String(value)} />
  ) : (
    <StatusBadge state={known.state} label={t(known.labelKey)} />
  );
}

/** The output of a run, preformatted, its "ERR:" marks in the error tint. */
function RunLog({ value }: { value: string | undefined }) {
  if (value === undefined || value === "") return null;
  const parts = value.split("ERR:");
  return (
    <pre className="m-0 font-mono wrap-anywhere whitespace-pre-wrap">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="font-semibold text-state-down">ERR:</span>}
          {part}
        </span>
      ))}
    </pre>
  );
}

function renderCell(prop: LogProp, row: ComplianceLogRow, locale: string) {
  switch (prop) {
    case "run_date":
      return <DateTime value={row.run_date} locale={locale} />;
    case "nodes.nodename":
      return row["nodes.nodename"] === null || row["nodes.nodename"] === undefined ? null : (
        <CrossLink kind="node" id={row.node_id}>
          {row["nodes.nodename"]}
        </CrossLink>
      );
    case "services.svcname":
      return row["services.svcname"] === null || row["services.svcname"] === undefined ? null : (
        <CrossLink kind="service" id={row.svc_id}>
          {row["services.svcname"]}
        </CrossLink>
      );
    case "run_status":
      return <RunStatus value={row.run_status} />;
    case "run_log":
      return <RunLog value={row.run_log} />;
    case "rset_md5":
      return <span className="font-mono whitespace-nowrap">{row.rset_md5}</span>;
    default:
      return row[prop];
  }
}

/**
 * Columns whose distribution says nothing: the record id; the ids of the node and
 * the service, whose names have it; the output of the module, free text; and the
 * checksum of the rulesets, unreadable. The dates have none, as in every list.
 */
const NO_DISTRIBUTION = new Set<string>(["id", "node_id", "svc_id", "run_log", "rset_md5"]);

const COLUMNS: ListColumn<ComplianceLogRow>[] = LOG_PROPS.map((prop) => ({
  prop,
  labelKey: `complianceLogs.fields.${prop}`,
  distribution: NO_DISTRIBUTION.has(prop) ? false : undefined,
  numeric: prop === "id",
  family: FAMILY[prop],
  // `orderby` only accepts the columns of the main table.
  sortable: !prop.includes("."),
  filter:
    prop === "run_status"
      ? { kind: "enum" as const, options: STATUS_OPTIONS }
      : prop === "run_action"
        ? { kind: "enum" as const, options: ACTION_OPTIONS }
        : undefined,
  render: (row, locale) => renderCell(prop, row, locale),
}));

const ALL_PROPS: string[] = [...LOG_PROPS];

/** Columns shown and the id; the joined names are badges needing their own id. */
function queryProps(cols: string[] | undefined): string {
  const shown = visibleProps(cols, DEFAULT_COLS, ALL_PROPS);
  const extra = [
    ...(shown.includes("nodes.nodename") ? ["node_id"] : []),
    ...(shown.includes("services.svcname") ? ["svc_id"] : []),
  ];
  return [...new Set(["id", ...shown, ...extra])].join(",");
}

/**
 * The distribution of a column's values over the selection: the filters given
 * apply, not the pagination.
 */
async function complianceLogStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/compliance/logs", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchComplianceLogs(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/compliance/logs", {
    params: {
      query: {
        props: queryProps(search.cols),
        orderby: search.sort.join(","),
        offset: search.offset,
        limit: search.limit + 1,
        filter: filterQuery(search.filters),
      },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  // `data` holds the rows, or the counts when `stats` is asked for.
  const all: ComplianceLogRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useComplianceLogs(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "compliance-logs",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchComplianceLogs(search),
  });
}

/**
 * The runs of the compliance modules (check, fixable, fix) on the nodes the user
 * can see, the most recent first, as the collector's compliance log. The filterset
 * selects the runs by their node. Read-only.
 */
export function ComplianceLogsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("complianceLogs");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/compliance/logs" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/compliance/logs" });
  const { data, isPending, isError, error, isFetching } = useComplianceLogs(search);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/compliance/logs", {
      params: {
        query: {
          props: "id",
          limit: 0,
          filter: filterQuery(search.filters),
        },
      },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: ComplianceLogRow[] = Array.isArray(data.data) ? data.data : [];
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

  return (
    <section>
      <h1 className="mb-3 flex items-center gap-2 text-title font-semibold">
        <ObjectIcon kind="complianceLog" className="h-5 w-5" />
        {t("complianceLogs.title")}
      </h1>

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
        exportPage={(page) => fetchComplianceLogs({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        valueStats={complianceLogStats}
        filterable
      />
    </section>
  );
}
