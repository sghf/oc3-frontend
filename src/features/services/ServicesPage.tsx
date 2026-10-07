import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DateTime } from "@/components/ui/DateTime";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { FrozenMark } from "@/components/opensvc/FrozenMark";
import { frozenFilterOptions, STATUS_FILTER_OPTIONS } from "@/components/opensvc/filter-options";
import { ServiceActionsMenu } from "./ServiceActionsMenu";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import { statusBadge } from "@/components/opensvc/status";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey, type ColumnFilters } from "@/lib/column-filters";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";
import { idBatches } from "@/lib/commonality";
import { CommonalityPanel } from "@/components/opensvc/CommonalityPanel";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { ServiceDetailPanel } from "./ServiceDetailPanel";
import { AvailabilityRate } from "@/components/opensvc/AvailabilityRate";
import { formatPercent } from "@/lib/format";

type ServiceRow = components["schemas"]["ServiceRow"];

const DEFAULT_SORT = ["svcname"];

/**
 * Every service property exposed by apicollector, in the order of its
 * `meta.available_props`. `satisfies` confronts them with the generated schema: a
 * prop renamed on the oc3 side breaks the typecheck instead of disappearing
 * silently.
 */
const SERVICE_PROPS = [
  "id",
  "svc_id",
  "svcname",
  "cluster_id",
  "svc_status",
  "svc_availstatus",
  "svc_app",
  "svc_env",
  "svc_ha",
  "svc_topology",
  "svc_frozen",
  "svc_placement",
  "svc_provisioned",
  "svc_flex_min_nodes",
  "svc_flex_max_nodes",
  "svc_flex_target",
  "svc_flex_cpu_low_threshold",
  "svc_flex_cpu_high_threshold",
  "svc_autostart",
  "svc_nodes",
  "svc_drpnode",
  "svc_drpnodes",
  "svc_drptype",
  "svc_comment",
  "svc_created",
  "svc_status_updated",
  "svc_hostid",
  "svc_wave",
  "svc_config",
  "svc_config_updated",
  "svc_metrocluster",
  "svc_drnoaction",
  "svc_notifications",
  "svc_snooze_till",
  "svc_sla",
  "svc_availability",
  "svc_availability_updated",
  "updated",
] as const satisfies readonly (keyof ServiceRow)[];

/** Columns shown by default: the identity of the service and its state. */
const DEFAULT_COLS: string[] = [
  "svcname",
  "svc_availstatus",
  "svc_status",
  "svc_app",
  "svc_sla",
  "svc_availability",
  "svc_status_updated",
];

/** Integer props of the oc3 `service` mapping (the `colInt` and `col` helpers), aligned right. */
const NUMERIC_PROPS = new Set<string>([
  "id",
  "svc_sla",
  "svc_availability",
  "svc_ha",
  "svc_wave",
  "svc_flex_min_nodes",
  "svc_flex_max_nodes",
  "svc_flex_target",
  "svc_flex_cpu_low_threshold",
  "svc_flex_cpu_high_threshold",
]);

/** Props the collector stores as datetime. */
const DATE_PROPS = new Set<string>([
  "svc_availability_updated",
  "svc_created",
  "svc_status_updated",
  "svc_config_updated",
  "svc_snooze_till",
  "updated",
]);

/** State props, rendered with the shape and label of the badge rather than as raw text. */
const STATUS_PROPS = new Set<string>(["svc_status", "svc_availstatus"]);

/** Family of each column, in the vocabulary of the historical collector. */
const FAMILY: Record<string, ColumnFamily> = {
  id: "service",
  svc_id: "service",
  svcname: "service",
  cluster_id: "cluster",
  svc_status: "service",
  svc_availstatus: "service",
  svc_app: "app",
  svc_env: "env",
  svc_ha: "service",
  svc_topology: "service",
  svc_frozen: "service",
  svc_placement: "node",
  svc_provisioned: "service",
  svc_flex_min_nodes: "node",
  svc_flex_max_nodes: "node",
  svc_flex_target: "node",
  svc_flex_cpu_low_threshold: "cpu",
  svc_flex_cpu_high_threshold: "cpu",
  svc_autostart: "node",
  svc_nodes: "node",
  svc_drpnode: "node",
  svc_drpnodes: "node",
  svc_drptype: "service",
  svc_comment: "service",
  svc_created: "time",
  svc_status_updated: "time",
  svc_hostid: "node",
  svc_wave: "service",
  svc_config: "service",
  svc_config_updated: "time",
  svc_metrocluster: "cluster",
  svc_drnoaction: "service",
  svc_notifications: "alert",
  svc_snooze_till: "alert",
  svc_sla: "state",
  svc_availability: "state",
  svc_availability_updated: "time",
  updated: "time",
};

/**
 * Columns holding one value per service, the ids by constraint, the name in
 * practice: their distribution would only list each service once.
 */
const UNIQUE_PROPS = new Set<string>(["id", "svc_id", "svcname"]);

const COLUMNS: ListColumn<ServiceRow>[] = SERVICE_PROPS.map((prop) => ({
  prop,
  labelKey: `services.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "node",
  distribution: UNIQUE_PROPS.has(prop) ? false : undefined,
  filter: STATUS_PROPS.has(prop)
    ? { kind: "enum" as const, options: STATUS_FILTER_OPTIONS }
    : prop === "svc_frozen"
      ? { kind: "enum" as const, options: frozenFilterOptions("frozen", "unfrozen", "mixed") }
      : undefined,
  render: (row: ServiceRow, locale: string) => {
    const value = row[prop];
    if (prop === "svc_app")
      return (
        <CrossLink kind="app" id={typeof value === "string" ? value : undefined}>
          {value}
        </CrossLink>
      );
    if (STATUS_PROPS.has(prop) && typeof value === "string") {
      return <StatusBadge {...statusBadge(value)} />;
    }
    if (prop === "svc_sla")
      return typeof value === "number" ? formatPercent(value, locale, 3) : null;
    if (prop === "svc_availability")
      return typeof value === "number" ? (
        <AvailabilityRate rate={value} sla={row.svc_sla} locale={locale} />
      ) : null;
    // Like the last contact of a node: what counts is the age of the status.
    if (prop === "svc_status_updated" && typeof value === "string")
      return <RelativeTime value={value} locale={locale} />;
    if (DATE_PROPS.has(prop) && typeof value === "string")
      return <DateTime value={value} locale={locale} />;
    return value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/** Ask only for the columns shown: apicollector pushes the selection down to the database. */
/** `svc_frozen` is always requested: freezing is marked even with the column hidden. */
function queryProps(cols: string[] | undefined): string {
  const shown = visibleProps(cols, DEFAULT_COLS, ALL_PROPS);
  // The SLA goes with the availability, which is flagged against it.
  const withSla = shown.includes("svc_availability") ? ["svc_sla"] : [];
  return [...new Set(["svc_id", "svc_frozen", ...withSla, ...shown])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchServices(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const query = {
    props: queryProps(search.cols),
    orderby: search.sort.join(","),
    offset: search.offset,
    limit: search.limit + 1,
    filter: filterQuery(search.filters),
  };
  const response = await api.GET("/services", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  const all: ServiceRow[] = Array.isArray(response.data.data) ? response.data.data : [];
  return toPage(all, response.data.meta, search.limit);
}

/**
 * The distribution of a column's values over the selection: the filters given
 * apply, not the pagination.
 */
async function serviceStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/services", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

/** The services of `ids` with every column, for their comparison. */
async function fetchServicesByIds(ids: readonly string[]): Promise<ServiceRow[]> {
  const pages = await Promise.all(
    idBatches(ids).map(async (batch) => {
      const { data, error } = await api.GET("/services", {
        params: {
          query: { props: ALL_PROPS.join(","), limit: 0, filter: [`svc_id:in:${batch.join(",")}`] },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return Array.isArray(data.data) ? data.data : [];
    }),
  );
  return pages.flat();
}

function useServices(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "services",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchServices(search),
  });
}

export function ServicesPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("services");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/services" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/services" });
  const { data, isPending, isError, error, isFetching } = useServices(search);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // The services the last deletion removed, unticked from the list.
  const [deleted, setDeleted] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  // The selection narrowed from its comparison, ticked in the list.
  const [reselect, setReselect] = useState<string[] | undefined>(undefined);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const query = { props: "svc_id", limit: 0, filter: filterQuery(search.filters) };
    const response = await api.GET("/services", { params: { query } });
    if (response.error !== undefined) throw new Error(problemText(response.error));
    const rows: ServiceRow[] = Array.isArray(response.data.data) ? response.data.data : [];
    return rows.map((row) => row.svc_id).filter((id): id is string => id !== undefined);
  }

  function update(next: Partial<ResolvedListSearch>) {
    // A row's detail and the comparison share the right edge.
    if (next.sel !== undefined) setComparing(false);
    // Columns, sort, filters and page size follow the account, the other states
    // stay in the URL.
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  const selected = data?.rows.find((row) => row.svc_id === search.sel);
  // Names from the page on display: a selection extended to the following pages does
  // not have them all, so the id then serves as a fallback in the messages.
  const svcNames = Object.fromEntries(
    (data?.rows ?? []).map((row) => [row.svc_id ?? "", row.svcname ?? ""]),
  );

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="service" className="h-5 w-5" />
          {t("services.title")}
        </h1>
        <ServiceActionsMenu
          services={selectedIds.map((id) => ({ id, name: svcNames[id] ?? id }))}
          onDeleted={(ids) => {
            setDeleted(ids);
            // The detail of a deleted object has nothing left to show.
            if (search.sel !== undefined && ids.includes(search.sel))
              update({ sel: undefined, tab: undefined });
          }}
          onCompare={() => {
            // The drawers share the right edge: the comparison takes it.
            update({ sel: undefined, tab: undefined });
            setComparing(true);
          }}
        />
      </div>

      <CollectorList
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => row.svc_id}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchServices({ ...search, ...page })}
        total={data?.total}
        rowLead={(row) => <FrozenMark frozen={row.svc_frozen === "frozen"} />}
        onSelectionChange={setSelectedIds}
        selectAllMatching={allIds}
        unselect={deleted}
        reselect={reselect}
        valueStats={serviceStats}
        filterable
      />

      <CommonalityPanel
        open={comparing}
        onClose={() => {
          setComparing(false);
        }}
        kind="service"
        noun={(count) => t("services.compare.noun", { count })}
        ids={selectedIds}
        queryKey={["services"]}
        fetchRows={fetchServicesByIds}
        columns={COLUMNS}
        exclude={UNIQUE_PROPS}
        rowId={(row) => row.svc_id}
        rowName={(row) => row.svcname ?? row.svc_id ?? ""}
        onOpenRow={(id) => {
          update({ sel: id });
        }}
        onSelect={setReselect}
      />

      <ServiceDetailPanel
        svcId={search.sel}
        svcname={selected?.svcname ?? ""}
        onClose={() => {
          update({ sel: undefined, tab: undefined });
        }}
        tab={search.tab}
        onTabChange={(tab) => {
          update({ tab });
        }}
      />
    </section>
  );
}
