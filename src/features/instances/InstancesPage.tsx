import { useState } from "react";
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
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { statusBadge } from "@/components/opensvc/status";
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
import { idBatches } from "@/lib/commonality";
import { CommonalityPanel } from "@/components/opensvc/CommonalityPanel";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { InstanceDetailPanel } from "./InstanceDetailPanel";
import { FrozenMark } from "@/components/opensvc/FrozenMark";
import {
  BIT_FLAG_FILTER_OPTIONS,
  frozenFilterOptions,
  STATUS_FILTER_OPTIONS,
} from "@/components/opensvc/filter-options";
import { FlagSwitch } from "@/components/opensvc/FlagSwitch";
import { InstanceActionsMenu } from "./InstanceActionsMenu";
import { fromInstanceId, instanceName, toInstanceId } from "./instance-id";
import { useNow } from "@/lib/use-now";
import { isOutdated, REPORTING_TICK_MS } from "@/components/opensvc/reporting";
import { LastReport } from "@/components/opensvc/LastReport";

type InstanceRow = components["schemas"]["InstanceRow"];

/** An instance reads first by its service, then by the node that hosts it. */
const DEFAULT_SORT = ["services.svcname", "nodes.nodename"];

/**
 * Instance properties exposed by apicollector, in the column order of the
 * historical collector's instances table (`table_service_instances` in
 * `tables.js`): the service and its state first, the containers, the node, then the
 * instance's states. The props it did not have sit next to their kin. `services.`
 * and `nodes.` props come from the joined tables. `satisfies` confronts them with
 * the generated schema.
 */
const INSTANCE_PROPS = [
  "svc_id",
  "services.svcname",
  "err",
  "services.svc_ha",
  "services.svc_availstatus",
  "services.svc_status",
  "services.svc_app",
  "services.svc_env",
  "services.svc_topology",
  "mon_svctype",
  "mon_vmtype",
  "mon_vmname",
  "mon_vcpus",
  "mon_vmem",
  "mon_guestos",
  "nodes.node_env",
  "node_id",
  "nodes.nodename",
  "mon_smon_status",
  "mon_smon_global_expect",
  "mon_availstatus",
  "mon_overallstatus",
  "mon_frozen",
  "mon_frozen_at",
  "mon_encap_frozen_at",
  "mon_containerstatus",
  "mon_ipstatus",
  "mon_fsstatus",
  "mon_diskstatus",
  "mon_sharestatus",
  "mon_syncstatus",
  "mon_appstatus",
  "mon_hbstatus",
  "mon_updated",
  "mon_changed",
] as const satisfies readonly (keyof InstanceRow)[];

/**
 * Columns shown by default, those of the historical collector's instances table
 * (`default_columns` of `table_service_instances`), in the order of INSTANCE_PROPS.
 */
const DEFAULT_COLS: string[] = [
  "services.svcname",
  "err",
  "services.svc_ha",
  "services.svc_availstatus",
  "services.svc_status",
  "services.svc_app",
  "services.svc_env",
  "services.svc_topology",
  "mon_vmtype",
  "mon_vmname",
  "nodes.node_env",
  "nodes.nodename",
  "mon_smon_status",
  "mon_availstatus",
  "mon_overallstatus",
  "mon_updated",
];

const NUMERIC_PROPS = new Set<string>(["err", "mon_vcpus", "mon_vmem"]);

const DATE_PROPS = new Set<string>([
  "mon_frozen_at",
  "mon_encap_frozen_at",
  "mon_updated",
  "mon_changed",
]);

/** Statuses rendered as badges, standby states included: see `statusBadge`. */
const STATUS_PROPS = new Set<string>([
  "services.svc_availstatus",
  "services.svc_status",
  "mon_availstatus",
  "mon_overallstatus",
  "mon_ipstatus",
  "mon_fsstatus",
  "mon_diskstatus",
  "mon_containerstatus",
  "mon_sharestatus",
  "mon_syncstatus",
  "mon_appstatus",
  "mon_hbstatus",
]);

const FAMILY: Record<string, ColumnFamily> = {
  "services.svcname": "service",
  "services.svc_ha": "cluster",
  "services.svc_availstatus": "state",
  "services.svc_status": "state",
  "services.svc_app": "app",
  "services.svc_env": "env",
  "services.svc_topology": "cluster",
  "nodes.nodename": "node",
  "nodes.node_env": "env",
  err: "action",
  svc_id: "service",
  node_id: "node",
  mon_svctype: "env",
  mon_availstatus: "state",
  mon_overallstatus: "state",
  mon_smon_status: "state",
  mon_smon_global_expect: "state",
  mon_ipstatus: "network",
  mon_fsstatus: "disk",
  mon_diskstatus: "disk",
  mon_containerstatus: "hypervisor",
  mon_sharestatus: "disk",
  mon_syncstatus: "drp",
  mon_appstatus: "app",
  mon_hbstatus: "cluster",
  mon_frozen: "state",
  mon_frozen_at: "time",
  mon_encap_frozen_at: "time",
  mon_vmname: "hypervisor",
  mon_vmtype: "hypervisor",
  mon_guestos: "os",
  mon_vcpus: "cpu",
  mon_vmem: "memory",
  mon_updated: "time",
  mon_changed: "time",
};

/**
 * The unacknowledged action errors of the instance, in the colour of an error with
 * the mark of one, as the historical collector's "err" column; nothing when none.
 */
function ActionErrors({ count }: { count: number | undefined }) {
  const { t } = useTranslation();
  if (count === undefined || count === 0) return null;
  return (
    <span className="font-medium text-state-down" title={t("instances.actionErrors", { count })}>
      <span aria-hidden="true">■ </span>
      {count}
    </span>
  );
}

/** The joined names are sortable: `orderby` resolves them through the mapping joins. */
const COLUMNS: ListColumn<InstanceRow>[] = INSTANCE_PROPS.map((prop) => ({
  prop,
  labelKey: `instances.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "service",
  filter: STATUS_PROPS.has(prop)
    ? { kind: "enum" as const, options: STATUS_FILTER_OPTIONS }
    : prop === "mon_frozen"
      ? { kind: "enum" as const, options: frozenFilterOptions("1", "0") }
      : prop === "services.svc_ha"
        ? { kind: "enum" as const, options: BIT_FLAG_FILTER_OPTIONS }
        : undefined,
  render: (row: InstanceRow, locale: string) => {
    const value = row[prop];
    if (prop === "nodes.nodename")
      return (
        <CrossLink kind="node" id={row.node_id}>
          {value}
        </CrossLink>
      );
    if (prop === "services.svcname")
      return (
        <CrossLink kind="service" id={row.svc_id}>
          {value}
        </CrossLink>
      );
    if (prop === "services.svc_app")
      return (
        <CrossLink kind="app" id={typeof value === "string" ? value : undefined}>
          {value}
        </CrossLink>
      );
    if (prop === "services.svc_ha")
      return (
        <FlagSwitch
          value={row["services.svc_ha"] ?? undefined}
          labelKey="instances.fields.services.svc_ha"
        />
      );
    if (prop === "err") return <ActionErrors count={row.err} />;
    // The service's own statuses say nothing of the agent's last report on this node.
    if (prop === "services.svc_availstatus" || prop === "services.svc_status")
      return typeof value === "string" ? <StatusBadge {...statusBadge(value)} /> : null;
    if (STATUS_PROPS.has(prop) && typeof value === "string")
      return (
        <StatusBadge {...statusBadge(value)} outdated={isOutdated(row.mon_updated, Date.now())} />
      );
    // Last report of the agent for this instance: its age reads better as a distance.
    if (prop === "mon_updated")
      return (
        <LastReport
          value={row.mon_updated}
          locale={locale}
          outdated={isOutdated(row.mon_updated, Date.now())}
        />
      );
    if (DATE_PROPS.has(prop) && typeof value === "string")
      return <DateTime value={value} locale={locale} />;
    return value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/**
 * Columns shown, plus the two ids that name the instance, and the OS of the node when
 * its name is shown, for the logo.
 */
function queryProps(cols: string[] | undefined): string {
  const shown = visibleProps(cols, DEFAULT_COLS, ALL_PROPS);
  const extra: string[] = [];
  // `mon_frozen` and `mon_updated` always requested: freezing and an outdated status
  // are marked even with their columns hidden.
  // mon_vmname completes the id of an encapsulated instance, one row per container.
  return [
    ...new Set([
      "svc_id",
      "node_id",
      "mon_vmname",
      "mon_frozen",
      "mon_updated",
      ...shown,
      ...extra,
    ]),
  ].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchInstances(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/services_instances", {
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
  const all: InstanceRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

/** The distribution of a column's values over the selection, with the filters given. */
async function instanceStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const { data, error } = await api.GET("/services_instances", {
    params: {
      query: { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  return toValueStats(data.data, data.meta, prop);
}

/**
 * The instances of `ids` with every column, for their comparison: read by their
 * services and nodes, then kept by their own id, the pairs being crossed.
 */
async function fetchInstancesByIds(ids: readonly string[]): Promise<InstanceRow[]> {
  const wanted = new Set(ids);
  const pages = await Promise.all(
    idBatches(ids).map(async (batch) => {
      const keys = batch.flatMap((id) => {
        const key = fromInstanceId(id);
        return key === null ? [] : [key];
      });
      const svcIds = [...new Set(keys.map((key) => key.svcId))];
      const nodeIds = [...new Set(keys.map((key) => key.nodeId))];
      const { data, error } = await api.GET("/services_instances", {
        params: {
          query: {
            props: ALL_PROPS.join(","),
            limit: 0,
            filter: [`svc_id:in:${svcIds.join(",")}`, `node_id:in:${nodeIds.join(",")}`],
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: InstanceRow[] = Array.isArray(data.data) ? data.data : [];
      return rows.filter((row) =>
        wanted.has(toInstanceId(row.svc_id, row.node_id, row.mon_vmname) ?? ""),
      );
    }),
  );
  return pages.flat();
}

/** The ids of the service and the node: the names of the instance say the same. */
const COMPARE_EXCLUDED = new Set<string>(["svc_id", "node_id"]);

function useInstances(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "instances",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchInstances(search),
  });
}

/**
 * Filters saved as a filterset (SaveAsFilterset). Instances are rows of svcmon; their
 * node and service names are joined columns.
 */
const FILTERSET_SOURCE: FiltersetSource = { table: "svcmon", selects: "related" };

export function InstancesPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("instances");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/instances" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/instances" });
  const { data, isPending, isError, error, isFetching } = useInstances(search);
  // Rows age without the data changing: the outdated statuses are worked out again.
  useNow(REPORTING_TICK_MS);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/services_instances", {
      params: {
        query: {
          props: "svc_id,node_id,mon_vmname",
          limit: 0,
          filter: filterQuery(search.filters),
        },
      },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: InstanceRow[] = Array.isArray(data.data) ? data.data : [];
    return rows
      .map((row) => toInstanceId(row.svc_id, row.node_id, row.mon_vmname))
      .filter((id): id is string => id !== undefined);
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

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // The instances the last deletion removed, unticked from the list.
  const [deleted, setDeleted] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  // The selection narrowed from its comparison, ticked in the list.
  const [reselect, setReselect] = useState<string[] | undefined>(undefined);

  const selected = data?.rows.find(
    (row) => toInstanceId(row.svc_id, row.node_id, row.mon_vmname) === search.sel,
  );
  // "service @ node" rather than the compound id, to name the refusals.
  const instanceNames = Object.fromEntries(
    (data?.rows ?? []).map((row) => [
      toInstanceId(row.svc_id, row.node_id, row.mon_vmname) ?? "",
      instanceName(
        row["services.svcname"] ?? row.svc_id ?? "",
        row["nodes.nodename"] ?? row.node_id ?? "",
        row.mon_vmname,
      ),
    ]),
  );

  return (
    <section>
      {/* As tall as the Actions button from the start: checking a row must not push the list down. */}
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="instance" className="h-5 w-5" />
          {t("instances.title")}
        </h1>
        <InstanceActionsMenu
          instances={selectedIds.map((id) => ({ id, name: instanceNames[id] ?? id }))}
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
        rowId={(row) => toInstanceId(row.svc_id, row.node_id, row.mon_vmname)}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchInstances({ ...search, ...page })}
        total={data?.total}
        rowLead={(row) => <FrozenMark frozen={row.mon_frozen === "1"} />}
        onSelectionChange={setSelectedIds}
        selectAllMatching={allIds}
        unselect={deleted}
        reselect={reselect}
        valueStats={instanceStats}
        filterable
        filtersetSource={FILTERSET_SOURCE}
      />

      <CommonalityPanel
        open={comparing}
        onClose={() => {
          setComparing(false);
        }}
        kind="instance"
        noun={(count) => t("instances.compare.noun", { count })}
        ids={selectedIds}
        queryKey={["instances"]}
        fetchRows={fetchInstancesByIds}
        columns={COLUMNS}
        exclude={COMPARE_EXCLUDED}
        rowId={(row) => toInstanceId(row.svc_id, row.node_id, row.mon_vmname)}
        rowName={(row) =>
          instanceName(
            row["services.svcname"] ?? row.svc_id ?? "",
            row["nodes.nodename"] ?? row.node_id ?? "",
            row.mon_vmname,
          )
        }
        onOpenRow={(id) => {
          update({ sel: id });
        }}
        onSelect={setReselect}
      />

      <InstanceDetailPanel
        instanceId={search.sel}
        label={
          selected === undefined
            ? ""
            : instanceName(
                selected["services.svcname"] ?? "",
                selected["nodes.nodename"] ?? "",
                selected.mon_vmname,
              )
        }
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
