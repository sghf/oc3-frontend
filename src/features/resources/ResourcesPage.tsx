import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import { FLAG_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "@/components/opensvc/filter-options";
import { statusBadge } from "@/components/opensvc/status";
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
import { ResourceDetailPanel } from "./ResourceDetailPanel";
import { resourceFlag, resourceName } from "./resource-format";

type ResourceRow = components["schemas"]["ResourceRow"];

/** As the historical view: by service, then node, container and resource id. */
const DEFAULT_SORT = ["services.svcname", "nodes.nodename", "vmname", "rid"];

/** The columns of the historical resources view (`table_resmon`), in its order. */
const RESOURCE_PROPS = [
  "id",
  "svc_id",
  "services.svcname",
  "node_id",
  "nodes.nodename",
  "vmname",
  "rid",
  "res_type",
  "res_status",
  "res_desc",
  "res_log",
  "res_monitor",
  "res_disable",
  "res_optional",
  "changed",
  "updated",
] as const satisfies readonly (keyof ResourceRow)[];

const DEFAULT_COLS: string[] = [
  "services.svcname",
  "nodes.nodename",
  "vmname",
  "rid",
  "res_type",
  "res_status",
  "res_desc",
  "res_monitor",
  "res_disable",
  "res_optional",
  "updated",
];

/** T / F flags of the agent, shown as words. */
const FLAG_PROPS = new Set<string>(["res_monitor", "res_disable", "res_optional"]);

/** Families of the historical column picker: `resource` for the res_ columns and rid. */
const FAMILY: Record<string, ColumnFamily> = {
  id: "resource",
  svc_id: "service",
  "services.svcname": "service",
  node_id: "node",
  "nodes.nodename": "node",
  vmname: "node",
  changed: "time",
  updated: "time",
};

const COLUMNS: ListColumn<ResourceRow>[] = RESOURCE_PROPS.map((prop) => ({
  prop,
  labelKey: `resources.fields.${prop}`,
  numeric: prop === "id",
  family: FAMILY[prop] ?? "resource",
  filter:
    prop === "res_status"
      ? { kind: "enum" as const, options: STATUS_FILTER_OPTIONS }
      : FLAG_PROPS.has(prop)
        ? { kind: "enum" as const, options: FLAG_FILTER_OPTIONS }
        : undefined,
  render: (row: ResourceRow, locale: string) => {
    const value = row[prop];
    if (prop === "services.svcname")
      return (
        <CrossLink kind="service" id={row.svc_id}>
          {value}
        </CrossLink>
      );
    if (prop === "nodes.nodename")
      return (
        <CrossLink kind="node" id={row.node_id}>
          {value}
        </CrossLink>
      );
    if (prop === "rid") return <span className="font-mono">{value}</span>;
    if (prop === "res_status" && typeof value === "string" && value !== "")
      return <StatusBadge {...statusBadge(value)} />;
    if (FLAG_PROPS.has(prop)) return <FlagWord value={value} />;
    // The log of the agent, one line here: the whole of it is in the detail.
    if (prop === "res_log" && typeof value === "string")
      return (
        <span className="block max-w-md truncate font-mono text-data" title={value}>
          {value.split("\n").find((line) => line.trim() !== "") ?? ""}
        </span>
      );
    if (prop === "updated" && typeof value === "string" && value !== "")
      return <RelativeTime value={value} locale={locale} />;
    if (prop === "changed" && typeof value === "string" && value !== "")
      return <DateTime value={value} locale={locale} />;
    return value;
  },
}));

/** A flag of the agent in words, "yes" muted when it is off. */
function FlagWord({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const flag = resourceFlag(value);
  if (flag === undefined) return null;
  return (
    <span className={flag ? "" : "text-ink-muted"}>{t(flag ? "detail.yes" : "detail.no")}</span>
  );
}

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/** Columns shown, plus the ids the detail and the links need. */
function queryProps(cols: string[] | undefined): string {
  return [
    ...new Set(["id", "svc_id", "node_id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)]),
  ].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchResources(search: ResolvedListSearch) {
  // One row more than the page: whether another page follows.
  const { data, error } = await api.GET("/resources", {
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
  const all: ResourceRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useResources(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "resources",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchResources(search),
  });
}

/**
 * The resources of the service instances, as the agents report them: the
 * historical `view-resources` (`resmon`). A Manager sees them all, the others
 * those of the services of an app their teams are responsible for. Read-only: a
 * resource is described by its agent.
 */
export function ResourcesPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("resources");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/resources" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/resources" });
  const { data, isPending, isError, error, isFetching } = useResources(search);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/resources", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: ResourceRow[] = Array.isArray(data.data) ? data.data : [];
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
        <ObjectIcon kind="resource" className="h-5 w-5" />
        {t("resources.title")}
      </h1>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("resources.intro")}</p>

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
        exportPage={(page) => fetchResources({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <ResourceDetailPanel
        resourceId={search.sel}
        label={selected === undefined ? "" : resourceName(selected)}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
