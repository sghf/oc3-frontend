import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toPage } from "@/lib/api/page";
import { CheckState } from "@/components/opensvc/CheckState";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
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
import { CheckActionsMenu } from "./CheckActionsMenu";
import { CheckDetailPanel } from "./CheckDetailPanel";

type CheckRow = components["schemas"]["CheckRow"];

/** By node, then type and instance, as the historical table. */
const DEFAULT_SORT = ["nodes.nodename", "chk_type", "chk_instance"];

const CHECK_PROPS = [
  "id",
  "node_id",
  "nodes.nodename",
  "svc_id",
  "services.svcname",
  "chk_type",
  "chk_instance",
  "chk_value",
  "chk_low",
  "chk_high",
  "chk_err",
  "chk_threshold_provider",
  "chk_created",
  "chk_updated",
] as const satisfies readonly (keyof CheckRow)[];

/** The default columns of the historical table (`table_checks`), in its order. */
const DEFAULT_COLS: string[] = [
  "nodes.nodename",
  "services.svcname",
  "chk_type",
  "chk_instance",
  "chk_value",
  "chk_low",
  "chk_high",
  "chk_err",
  "chk_threshold_provider",
  "chk_updated",
];

const NUMERIC_PROPS = new Set<string>(["id", "chk_value", "chk_low", "chk_high"]);
const DATE_PROPS = new Set<string>(["chk_created", "chk_updated"]);

const FAMILY: Record<string, ColumnFamily> = {
  id: "state",
  node_id: "node",
  "nodes.nodename": "node",
  svc_id: "service",
  "services.svcname": "service",
  chk_type: "state",
  chk_instance: "state",
  chk_value: "state",
  chk_low: "alert",
  chk_high: "alert",
  chk_err: "alert",
  chk_threshold_provider: "alert",
  chk_created: "time",
  chk_updated: "time",
};

/** Where a check stands, as the state column words it. */
const STATE_OPTIONS: ColumnFilterOption[] = [
  { value: "0", labelKey: "nodes.checks.within" },
  { value: "1", labelKey: "nodes.checks.below" },
  { value: "2", labelKey: "nodes.checks.above" },
];

const COLUMNS: ListColumn<CheckRow>[] = CHECK_PROPS.map((prop) => ({
  prop,
  labelKey: `checks.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "state",
  filter: prop === "chk_err" ? { kind: "enum" as const, options: STATE_OPTIONS } : undefined,
  render: (row: CheckRow) => {
    const value = row[prop];
    if (prop === "nodes.nodename")
      return (
        <CrossLink kind="node" id={row.node_id}>
          {value}
        </CrossLink>
      );
    if (prop === "services.svcname")
      return row.svc_id === undefined || row.svc_id === "" ? null : (
        <CrossLink kind="service" id={row.svc_id}>
          {value}
        </CrossLink>
      );
    if (prop === "chk_err") return <CheckState err={row.chk_err} />;
    if (DATE_PROPS.has(prop) && typeof value === "string") return <DateTime value={value} />;
    return value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/**
 * Columns shown and the id, plus the key of the check, which its actions need,
 * and the ids the node and service badges open.
 */
function queryProps(cols: string[] | undefined): string {
  const shown = visibleProps(cols, DEFAULT_COLS, ALL_PROPS);
  return [...new Set(["id", "node_id", "svc_id", "chk_type", "chk_instance", ...shown])].join(",");
}

async function checkStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/checks/live", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchChecks(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/checks/live", {
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
  const all: CheckRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useChecks(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "checks",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchChecks(search),
  });
}

/**
 * The checks the agents report, on every node the user may see, with the
 * thresholds the collector sets them and where those come from; the historical
 * Checks view (`table_checks`). On a selection: setting and resetting their
 * thresholds, and deleting them.
 */
export function ChecksPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("checks");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/checks" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/checks" });
  const { data, isPending, isError, error, isFetching } = useChecks(search);
  // The rows checked, and those just deleted, for the list to untick them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);

  // Names from the page on display, for the reports of the actions; a check of
  // the following pages a selection extends to is named by its id.
  const names = new Map<string, string>();
  for (const row of data?.rows ?? []) {
    if (row.id === undefined || row.node_id === undefined || row.chk_type === undefined) continue;
    const id = String(row.id);
    const instance = row.chk_instance ?? "";
    names.set(id, `${row["nodes.nodename"] ?? row.node_id} ${row.chk_type}:${instance}`);
  }

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/checks/live", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: CheckRow[] = Array.isArray(data.data) ? data.data : [];
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
      {/* As tall as the Actions button from the start: checking a row must not push the list down. */}
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="check" className="h-5 w-5" />
          {t("checks.title")}
        </h1>
        {/* On the rows checked in the list; nothing checked, no menu. */}
        <CheckActionsMenu
          checks={selectedIds.map((id) => ({ id, name: names.get(id) ?? id }))}
          onDeleted={(ids) => {
            setDeleted(ids);
            if (search.sel !== undefined && ids.includes(search.sel)) update({ sel: undefined });
          }}
        />
      </div>

      <CollectorList
        viewPrefs={prefs}
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
        exportPage={(page) => fetchChecks({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        onSelectionChange={setSelectedIds}
        unselect={deleted}
        valueStats={checkStats}
        filterable
      />

      <CheckDetailPanel
        checkId={search.sel}
        label={search.sel === undefined ? "" : (names.get(search.sel) ?? "")}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
