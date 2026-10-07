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
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
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

type NodeHardwareRow = components["schemas"]["NodeHardwareRow"];

/** By node, then component family, then address, as the historical table. */
const DEFAULT_SORT = ["nodes.nodename", "hw_type", "hw_path"];

/**
 * Hardware properties exposed by apicollector: the node name first, then the order
 * of `meta.available_props`, then the other joined node properties.
 * `satisfies` confronts them with the generated schema.
 */
const HARDWARE_PROPS = [
  "nodes.nodename",
  "id",
  "node_id",
  "hw_type",
  "hw_path",
  "hw_class",
  "hw_description",
  "hw_driver",
  "updated",
  "nodes.app",
  "nodes.os_name",
] as const satisfies readonly (keyof NodeHardwareRow)[];

/** The default columns of the historical nodes hardware table. */
const DEFAULT_COLS: string[] = [
  "nodes.nodename",
  "hw_type",
  "hw_path",
  "hw_class",
  "hw_description",
  "hw_driver",
  "updated",
];

/** Component families the agent reports, with the labels of the node Hardware tab. */
const HW_TYPES = ["mem", "cpu", "pci", "usb", "disk"];
const TYPE_OPTIONS: ColumnFilterOption[] = HW_TYPES.map((value) => ({
  value,
  labelKey: `nodes.hardware.types.${value}`,
}));

const FAMILY: Record<string, ColumnFamily> = {
  "nodes.nodename": "node",
  node_id: "node",
  "nodes.app": "app",
  "nodes.os_name": "os",
  updated: "time",
};

/**
 * The columns. `t` translates the component family, which the agent reports as a
 * short code (`pci`, `mem`…).
 */
function columns(t: (key: string) => string, has: (key: string) => boolean) {
  return HARDWARE_PROPS.map((prop): ListColumn<NodeHardwareRow> => ({
    prop,
    labelKey: `hardware.fields.${prop}`,
    numeric: prop === "id",
    family: FAMILY[prop] ?? "cpu",
    filter: prop === "hw_type" ? { kind: "enum", options: TYPE_OPTIONS } : undefined,
    render: (row, locale) => {
      const value = row[prop];
      if (prop === "nodes.nodename")
        return (
          <CrossLink kind="node" id={row.node_id}>
            {value}
          </CrossLink>
        );
      if (prop === "hw_type" && typeof value === "string")
        return has(`nodes.hardware.types.${value}`) ? t(`nodes.hardware.types.${value}`) : value;
      if (prop === "hw_path" && typeof value === "string") return <code>{value}</code>;
      // Date of the agent's last asset push: its age reads better as a distance.
      if (prop === "updated" && typeof value === "string")
        return <RelativeTime value={value} locale={locale} />;
      return value;
    },
  }));
}

const ALL_PROPS: string[] = [...HARDWARE_PROPS];

/** Columns shown, plus the row id and the node id the node name links with. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", "node_id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchHardware(search: ResolvedListSearch) {
  const { data, error } = await api.GET("/nodes/hardware", {
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
  const all: NodeHardwareRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useHardware(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "hardware",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchHardware(search),
  });
}

/**
 * Hardware of the nodes the user can see, as their agents report it: one row per
 * component (memory bank, PCI device…) of each node. Read-only; the rows are
 * filtered and sorted by the server.
 */
export function HardwarePage() {
  const { t, i18n } = useTranslation();
  const prefs = useViewPrefs("hardware");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/hardware" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/hardware" });
  const { data, isPending, isError, error, isFetching } = useHardware(search);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/nodes/hardware", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: NodeHardwareRow[] = Array.isArray(data.data) ? data.data : [];
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
        <ObjectIcon kind="hardware" className="h-5 w-5" />
        {t("hardware.title")}
      </h1>

      <CollectorList
        columns={columns(t, (key) => i18n.exists(key))}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchHardware({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />
    </section>
  );
}
