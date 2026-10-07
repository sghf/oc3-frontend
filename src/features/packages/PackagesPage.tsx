import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import type { FiltersetSource } from "@/lib/filterset-entries";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { DateTime } from "@/components/ui/DateTime";
import { RelativeTime } from "@/components/ui/RelativeTime";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey } from "@/lib/column-filters";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";

type PackageRow = components["schemas"]["PackageRow"];

/** By node, then package, then architecture, as the historical packages table. */
const DEFAULT_SORT = ["nodes.nodename", "pkg_name", "pkg_arch"];

/**
 * Package properties exposed by apicollector: the node name first, then the order
 * of `meta.available_props`, then the other joined node properties.
 * `satisfies` confronts them with the generated schema.
 */
const PACKAGE_PROPS = [
  "nodes.nodename",
  "id",
  "node_id",
  "pkg_name",
  "pkg_version",
  "pkg_arch",
  "pkg_type",
  "pkg_sig",
  "sig_provider",
  "pkg_install_date",
  "pkg_updated",
  "nodes.app",
  "nodes.os_name",
] as const satisfies readonly (keyof PackageRow)[];

/** The default columns of the historical packages table. */
const DEFAULT_COLS: string[] = [
  "nodes.nodename",
  "pkg_name",
  "pkg_version",
  "pkg_arch",
  "pkg_type",
  "sig_provider",
  "pkg_install_date",
  "pkg_updated",
];

const FAMILY: Record<string, ColumnFamily> = {
  "nodes.nodename": "node",
  node_id: "node",
  "nodes.app": "app",
  "nodes.os_name": "os",
  pkg_install_date: "time",
  pkg_updated: "time",
};

const COLUMNS: ListColumn<PackageRow>[] = PACKAGE_PROPS.map((prop) => ({
  prop,
  labelKey: `packages.fields.${prop}`,
  numeric: prop === "id",
  family: FAMILY[prop] ?? "package",
  render: (row: PackageRow, locale: string) => {
    const value = row[prop];
    if (prop === "nodes.nodename")
      return (
        <CrossLink kind="node" id={row.node_id}>
          {value}
        </CrossLink>
      );
    // Last report of the agent for this package: its age reads better as a distance.
    if (prop === "pkg_updated" && typeof value === "string")
      return <RelativeTime value={value} locale={locale} />;
    if (prop === "pkg_install_date" && typeof value === "string" && value !== "")
      return <DateTime value={value} locale={locale} />;
    return value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/** Columns shown, plus the row id and the node id the node name links with. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", "node_id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchPackages(search: ResolvedListSearch) {
  const { data, error } = await api.GET("/packages", {
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
  const all: PackageRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function usePackages(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "packages",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchPackages(search),
  });
}

/**
 * Filters saved as a filterset (SaveAsFilterset). Packages are rows of the packages
 * table.
 */
const FILTERSET_SOURCE: FiltersetSource = {
  table: "packages",
  // Read from pkg_sig_provider, which filtersets cannot filter on.
  exclude: ["sig_provider"],
  selects: "related",
};

/**
 * Packages installed on the nodes the user can see, as their agents report them:
 * one row per node and package, with the provider of the signing key. Read-only;
 * the rows are filtered and sorted by the server.
 */
export function PackagesPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("packages");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/packages" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/packages" });
  const { data, isPending, isError, error, isFetching } = usePackages(search);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/packages", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: PackageRow[] = Array.isArray(data.data) ? data.data : [];
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
        <ObjectIcon kind="package" className="h-5 w-5" />
        {t("packages.title")}
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
        exportPage={(page) => fetchPackages({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
        filtersetSource={FILTERSET_SOURCE}
      />
    </section>
  );
}
