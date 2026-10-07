import { useState } from "react";
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
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { FrozenMark } from "@/components/opensvc/FrozenMark";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
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
import { ClusterActionsMenu } from "./ClusterActionsMenu";
import { ClusterDetailPanel } from "./ClusterDetailPanel";
import { ClusterNodes } from "./ClusterNodes";

type ClusterRow = components["schemas"]["ClusterRow"];

/** By name. */
const DEFAULT_SORT = ["cluster_name"];

const CLUSTER_PROPS = [
  "cluster_name",
  "node_count",
  "svc_count",
  "cluster_nodes",
  "agent_versions",
  "frozen",
  "quorum",
  "compat",
  "listener_port",
  "cluster_updated",
  "cluster_id",
  "id",
] as const satisfies readonly (keyof ClusterRow)[];

type ClusterProp = (typeof CLUSTER_PROPS)[number];

const DEFAULT_COLS: string[] = [
  "cluster_name",
  "node_count",
  "svc_count",
  "cluster_nodes",
  "agent_versions",
  "cluster_updated",
];

const FAMILY: Record<ClusterProp, ColumnFamily> = {
  cluster_name: "cluster",
  cluster_id: "cluster",
  id: "cluster",
  node_count: "node",
  cluster_nodes: "node",
  agent_versions: "node",
  svc_count: "service",
  frozen: "state",
  quorum: "state",
  compat: "state",
  listener_port: "network",
  cluster_updated: "time",
};

const NUMERIC = new Set<string>(["node_count", "svc_count", "listener_port", "id"]);

/** The daemon flags, 1 or 0, offered by their meaning. */
const FLAG_OPTIONS: ColumnFilterOption[] = [
  { value: "1", labelKey: "detail.yes" },
  { value: "0", labelKey: "detail.no" },
];
const FROZEN_OPTIONS: ColumnFilterOption[] = [
  { value: "1", labelKey: "state.frozen" },
  { value: "0", labelKey: "state.thawed" },
];

function columns(): ListColumn<ClusterRow>[] {
  return CLUSTER_PROPS.map((prop) => ({
    prop,
    labelKey: `clusters.fields.${prop}`,
    numeric: NUMERIC.has(prop),
    family: FAMILY[prop],
    filter:
      prop === "frozen"
        ? { kind: "enum" as const, options: FROZEN_OPTIONS }
        : prop === "quorum" || prop === "compat"
          ? { kind: "enum" as const, options: FLAG_OPTIONS }
          : undefined,
    render: (row: ClusterRow, locale: string) => {
      const value = row[prop];
      if (prop === "cluster_nodes")
        return <ClusterNodes clusterId={row.cluster_id} names={row.cluster_nodes} />;
      if (prop === "frozen" || prop === "quorum" || prop === "compat")
        return <Flag prop={prop} value={value} />;
      // The age of the status says whether the cluster still reports.
      if (prop === "cluster_updated" && typeof value === "string" && value !== "")
        return <RelativeTime value={value} locale={locale} />;
      return value;
    },
  }));
}

/** A daemon flag in words, never by colour alone. */
function Flag({ prop, value }: { prop: "frozen" | "quorum" | "compat"; value: unknown }) {
  const { t } = useTranslation();
  if (value !== 0 && value !== 1) return null;
  if (prop === "frozen")
    return value === 1 ? (
      <span className="flex items-center gap-1">
        <FrozenMark frozen />
        {t("state.frozen")}
      </span>
    ) : (
      <span className="text-ink-muted">{t("state.thawed")}</span>
    );
  if (prop === "compat" && value === 0)
    return <span className="text-state-warn">▲ {t("clusters.incompatible")}</span>;
  return (
    <span className={value === 1 ? "" : "text-ink-muted"}>
      {t(value === 1 ? "detail.yes" : "detail.no")}
    </span>
  );
}

const ALL_PROPS = [...CLUSTER_PROPS];

/** Columns shown, plus the id the detail opens by and the freezing marked at the head. */
function queryProps(cols: string[] | undefined): string {
  return [
    ...new Set(["cluster_id", "frozen", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)]),
  ].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchClusters(search: ResolvedListSearch) {
  // One row more than the page: whether another page follows.
  const { data, error } = await api.GET("/clusters", {
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
  const all: ClusterRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useClusters(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "clusters",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchClusters(search),
  });
}

/**
 * The clusters: those whose daemon pushed its status to the collector, with the
 * nodes and services of the collector that name them. A Manager sees them all, the
 * others the clusters holding a node or a service of an app their groups are
 * responsible for. Read-only: a cluster is described by its daemon.
 */
export function ClustersPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("clusters");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/clusters" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/clusters" });
  const { data, isPending, isError, error, isFetching } = useClusters(search);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/clusters", {
      params: { query: { props: "cluster_id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: ClusterRow[] = Array.isArray(data.data) ? data.data : [];
    return rows.flatMap((row) => (row.cluster_id === undefined ? [] : [row.cluster_id]));
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

  const selected = data?.rows.find((row) => row.cluster_id === search.sel);
  // Names from the page on display: a selection extended to the following pages does
  // not have them all, so the id then serves as a fallback in the messages.
  const clusterNames = Object.fromEntries(
    (data?.rows ?? []).map((row) => [row.cluster_id ?? "", row.cluster_name ?? ""]),
  );

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="cluster" className="h-5 w-5" />
          {t("clusters.title")}
        </h1>
        {/* On the rows checked in the list; nothing checked, no menu. */}
        <ClusterActionsMenu
          clusters={selectedIds.map((id) => ({ id, name: clusterNames[id] ?? id }))}
        />
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("clusters.intro")}</p>

      <CollectorList
        columns={columns()}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => row.cluster_id}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchClusters({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        rowLead={(row) => <FrozenMark frozen={row.frozen === 1} />}
        onSelectionChange={setSelectedIds}
        filterable
      />

      <ClusterDetailPanel
        clusterId={search.sel}
        label={selected?.cluster_name ?? ""}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
