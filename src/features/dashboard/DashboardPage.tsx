import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DateTime } from "@/components/ui/DateTime";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { SeverityBadge } from "@/components/opensvc/SeverityBadge";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { filterQuery, filtersKey } from "@/lib/column-filters";
import type { ColumnFilterOption } from "@/components/opensvc/CollectorList";
import { AlertDetailPanel } from "./AlertDetailPanel";

type AlertRow = components["schemas"]["AlertRow"];

/** The historical dashboard sorts by decreasing severity, then by type. */
const DEFAULT_SORT = ["-dash_severity", "dash_type"];

/** Name of the object aimed at: an entry carries either a service or a node. */
function objectName(row: AlertRow): string {
  return row["services.svcname"] ?? row["nodes.nodename"] ?? "";
}

/** The severities the collector raises, from the lowest, each with its badge. */
const SEVERITY_OPTIONS: ColumnFilterOption[] = [0, 1, 2, 3, 4, 5].map((severity) => ({
  value: String(severity),
  render: <SeverityBadge severity={severity} />,
}));

/**
 * The columns of the dashboard, each filtered by the server: the object on the
 * service name, or the node name when the alert has none; the message on its
 * format and values as stored, the text shown being built from them.
 */
const COLUMNS: ListColumn<AlertRow>[] = [
  {
    prop: "dash_severity",
    labelKey: "alerts.fields.dash_severity",
    family: "alert",
    filter: { kind: "enum", options: SEVERITY_OPTIONS },
    render: (r) => <SeverityBadge severity={r.dash_severity ?? 0} />,
  },
  {
    prop: "dash_type",
    labelKey: "alerts.fields.dash_type",
    family: "alert",
    render: (r) => r.dash_type,
  },
  {
    prop: "services.svcname",
    labelKey: "alerts.fields.object",
    family: "service",
    // orderby does not accept joined props: this column cannot be sorted.
    sortable: false,
    // The alert carries a service or a node: the badge leads to whichever carries it.
    render: (r) =>
      r.svc_id !== undefined && r.svc_id !== "" ? (
        <CrossLink kind="service" id={r.svc_id}>
          {objectName(r)}
        </CrossLink>
      ) : (
        <CrossLink kind="node" id={r.node_id}>
          {objectName(r)}
        </CrossLink>
      ),
  },
  {
    prop: "dash_env",
    labelKey: "alerts.fields.dash_env",
    family: "env",
    render: (r) => r.dash_env,
  },
  {
    prop: "alert",
    labelKey: "alerts.fields.alert",
    family: "alert",
    sortable: false,
    render: (r) => r.alert,
  },
  {
    prop: "dash_created",
    labelKey: "alerts.fields.dash_created",
    family: "time",
    render: (r, locale) => <DateTime value={r.dash_created} locale={locale} />,
  },
  {
    prop: "dash_updated",
    labelKey: "alerts.fields.dash_updated",
    family: "time",
    render: (r, locale) => <DateTime value={r.dash_updated} locale={locale} />,
  },
];

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/** This view declares few columns: all of them are shown by default. */
const DEFAULT_COLS = ALL_PROPS;

function queryProps(cols: string[] | undefined): string {
  const shown = visibleProps(cols, DEFAULT_COLS, ALL_PROPS);
  // The "object" column reads both joined names, and the id serves for the detail.
  const extra = shown.includes("services.svcname") ? ["nodes.nodename", "svc_id", "node_id"] : [];
  return ["id", ...shown, ...extra].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchAlerts(search: ResolvedListSearch) {
  const query = {
    props: queryProps(search.cols),
    orderby: search.sort.join(","),
    offset: search.offset,
    limit: search.limit + 1,
    filter: filterQuery(search.filters),
  };
  const { data, error } = await api.GET("/alerts", { params: { query } });
  if (error !== undefined) throw new Error(JSON.stringify(error));
  const all: AlertRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useAlerts(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "alerts",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchAlerts(search),
  });
}

/** Breakdown by severity, over every entry and not over the current page. */
function useSeverityCounts() {
  return useQuery({
    queryKey: ["alerts", "severity-counts"],
    queryFn: async () => {
      const { data, error } = await api.GET("/alerts", {
        // `stats` is declared as a string in the spec, not as a boolean.
        params: { query: { props: "dash_severity", stats: "true", limit: 0 } },
      });
      if (error !== undefined) throw new Error(JSON.stringify(error));
      const distinct = Array.isArray(data.data) ? {} : data.data;
      const counts = distinct.dash_severity ?? {};
      return Object.entries(counts)
        .map(([severity, count]) => ({ severity: Number(severity), count }))
        .sort((a, b) => b.severity - a.severity);
    },
  });
}

export function DashboardPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("dashboard");
  const search = resolveListSearch(withSavedSearch(useSearch({ from: "/" }), prefs), DEFAULT_SORT);
  const navigate = useNavigate({ from: "/" });
  const { data, isPending, isError, error, isFetching } = useAlerts(search);
  const severities = useSeverityCounts();

  /** Ids of the whole selection, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/alerts", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(JSON.stringify(error));
    const rows: AlertRow[] = Array.isArray(data.data) ? data.data : [];
    return rows
      .map((row) => row.id)
      .filter((id): id is number => id !== undefined)
      .map(String);
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
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="dashboard" className="h-5 w-5" />
          {t("dashboard.title")}
        </h1>
        {(severities.data ?? []).map((entry) => (
          <span key={entry.severity} className="flex items-center gap-1 text-ink-muted">
            <SeverityBadge severity={entry.severity} />
            {entry.count}
          </span>
        ))}
      </div>

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
        exportPage={(page) => fetchAlerts({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <AlertDetailPanel
        alertId={search.sel}
        label={selected === undefined ? "" : (selected.dash_type ?? "")}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
