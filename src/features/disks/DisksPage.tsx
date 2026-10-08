import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DateTime } from "@/components/ui/DateTime";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toPage } from "@/lib/api/page";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { formatSizeMiB } from "@/lib/format";
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
import { DiskDetailPanel } from "./DiskDetailPanel";

type DiskRow = components["schemas"]["DiskRow"];

const DEFAULT_SORT = ["nodename", "disk_id"];

/**
 * Every disk property exposed by apicollector, in the order of its
 * `meta.available_props`. `satisfies` confronts them with the generated schema.
 */
const DISK_PROPS = [
  "disk_id",
  "disk_name",
  "disk_devid",
  "disk_vendor",
  "disk_model",
  "disk_size",
  "disk_used",
  "disk_alloc",
  "disk_raid",
  "disk_group",
  "disk_level",
  "disk_arrayid",
  "disk_dg",
  "disk_region",
  "node_id",
  "nodename",
  "svc_id",
  "svcname",
  "app",
  "updated",
] as const satisfies readonly (keyof DiskRow)[];

/** Default columns: which disk, of which size, attached to what. */
const DEFAULT_COLS: string[] = [
  "disk_id",
  "disk_model",
  "disk_size",
  "disk_used",
  "nodename",
  "svcname",
];

/** Integer props of the oc3 `disk` mapping (the `colInt` helper), aligned right. */
const NUMERIC_PROPS = new Set<string>(["disk_size", "disk_used", "disk_alloc", "disk_level"]);

/** Sizes in mebibytes, like node memory. */
const SIZE_PROPS = new Set<string>(["disk_size", "disk_used", "disk_alloc"]);

/** Props the collector stores as datetime. */
const DATE_PROPS = new Set<string>(["updated"]);

/** Family of each column, in the vocabulary of the historical collector. */
const FAMILY: Record<string, ColumnFamily> = {
  disk_id: "disk",
  disk_name: "disk",
  disk_devid: "disk",
  disk_vendor: "disk",
  disk_model: "disk",
  disk_size: "disk",
  disk_used: "disk",
  disk_alloc: "disk",
  disk_raid: "disk",
  disk_group: "disk",
  disk_level: "disk",
  disk_arrayid: "disk",
  disk_dg: "disk",
  disk_region: "disk",
  node_id: "node",
  nodename: "node",
  svc_id: "service",
  svcname: "service",
  app: "app",
  updated: "time",
};

/**
 * Columns whose distribution says nothing: the ids of the node and the service,
 * whose names have it. The dates have none, as in every list. The disk id keeps
 * its own: a disk seen by several nodes holds several rows, worth spotting.
 */
const NO_DISTRIBUTION = new Set<string>(["node_id", "svc_id"]);

const COLUMNS: ListColumn<DiskRow>[] = DISK_PROPS.map((prop) => ({
  prop,
  labelKey: `disks.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "node",
  distribution: NO_DISTRIBUTION.has(prop) ? false : undefined,
  // The sizes read in their distribution as in the cells.
  formatValue: SIZE_PROPS.has(prop)
    ? (value: string, locale: string) =>
        value === "" || Number.isNaN(Number(value))
          ? value
          : formatSizeMiB(Number(value), locale) || value
    : undefined,
  render: (row: DiskRow, locale: string) => {
    const value = row[prop];
    if (prop === "app")
      return (
        <CrossLink kind="app" id={typeof value === "string" ? value : undefined}>
          {value}
        </CrossLink>
      );
    if (prop === "nodename")
      return (
        <CrossLink kind="node" id={row.node_id}>
          {value}
        </CrossLink>
      );
    if (prop === "svcname")
      return (
        <CrossLink kind="service" id={row.svc_id}>
          {value}
        </CrossLink>
      );
    if (SIZE_PROPS.has(prop) && typeof value === "number") return formatSizeMiB(value, locale);
    if (DATE_PROPS.has(prop) && typeof value === "string")
      return <DateTime value={value} locale={locale} />;
    return value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/**
 * Columns shown and the id, plus the ids of the node and the service: their names are
 * badges that open their view, and those need their target.
 */
function queryProps(cols: string[] | undefined): string {
  const shown = visibleProps(cols, DEFAULT_COLS, ALL_PROPS);
  const extra = [
    ...(shown.includes("nodename") ? ["node_id"] : []),
    ...(shown.includes("svcname") ? ["svc_id"] : []),
  ];
  return [...new Set(["disk_id", ...shown, ...extra])].join(",");
}

/**
 * The distribution of a column's values over the selection: the filters given
 * apply, not the pagination.
 */
async function diskStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/disks", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchDisks(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/disks", {
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
  if (error !== undefined) throw new Error(JSON.stringify(error));
  const all: DiskRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useDisks(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "disks",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchDisks(search),
  });
}

export function DisksPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("disks");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/disks" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/disks" });
  const { data, isPending, isError, error, isFetching } = useDisks(search);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/disks", {
      params: { query: { props: "disk_id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(JSON.stringify(error));
    const rows: DiskRow[] = Array.isArray(data.data) ? data.data : [];
    return rows.map((row) => row.disk_id).filter((id): id is string => id !== undefined);
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

  const selected = data?.rows.find((row) => row.disk_id === search.sel);

  return (
    <section>
      <h1 className="mb-3 flex items-center gap-2 text-title font-semibold">
        <ObjectIcon kind="disk" className="h-5 w-5" />
        {t("disks.title")}
      </h1>

      <CollectorList
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => row.disk_id}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchDisks({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        valueStats={diskStats}
        filterable
      />

      <DiskDetailPanel
        diskId={search.sel}
        label={selected?.disk_id ?? ""}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
