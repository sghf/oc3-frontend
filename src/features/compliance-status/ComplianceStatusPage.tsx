import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { SelectionDeleteMenu } from "@/components/opensvc/SelectionDeleteMenu";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { RUN_STATUS_OPTIONS, RunLog, RunStatus } from "@/components/opensvc/ComplianceRun";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { CategoryTabs, CategoryCount } from "@/components/ui/CategoryTabs";
import { DateTime } from "@/components/ui/DateTime";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import {
  filterQuery,
  filtersKey,
  fromPickedValues,
  withFilter,
  type ColumnFilters,
} from "@/lib/column-filters";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";
import { parseCollectorDate } from "@/lib/format";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";

type StatusRow = components["schemas"]["ComplianceStatusRow"];
type Counts = components["schemas"]["ComplianceStatusCounts"];
type Group = components["schemas"]["ComplianceStatusGroup"];

/** What the counts are grouped by, besides the list of the runs. */
type Grouping = "module" | "node" | "service";
type Section = "runs" | Grouping;

/** The most recent first, as the historical table. */
const DEFAULT_SORT = ["-run_date"];

/**
 * Days after which a check no longer tells the state of its module, as the server
 * counts it (`CompStatusObsoleteAfter` in oc3) and the historical views did.
 */
const OBSOLETE_DAYS = 7;

/**
 * Props exposed by apicollector, joined names included, in the order of the
 * historical table (`table_comp_status`). `satisfies` confronts them with the
 * generated schema.
 */
const STATUS_PROPS = [
  "id",
  "run_date",
  "node_id",
  "nodes.nodename",
  "svc_id",
  "services.svcname",
  "run_module",
  "run_status",
  "rset_md5",
  "run_log",
] as const satisfies readonly (keyof StatusRow)[];

type StatusProp = (typeof STATUS_PROPS)[number];

/** The default columns of the historical table, in its column order. */
const DEFAULT_COLS: string[] = [
  "run_date",
  "nodes.nodename",
  "services.svcname",
  "run_module",
  "run_status",
];

const FAMILY: Record<StatusProp, ColumnFamily> = {
  id: "state",
  run_date: "time",
  node_id: "node",
  "nodes.nodename": "node",
  svc_id: "service",
  "services.svcname": "service",
  run_module: "moduleset",
  run_status: "state",
  rset_md5: "ruleset",
  run_log: "alert",
};

/** Whether a check is too old to tell the state of its module at `now`. */
function isObsolete(runDate: string | undefined, now: number): boolean {
  const parsed = parseCollectorDate(runDate);
  return parsed !== null && now - parsed.getTime() > OBSOLETE_DAYS * 24 * 60 * 60 * 1000;
}

function renderCell(prop: StatusProp, row: StatusRow, locale: string) {
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
      // An obsolete check keeps its status, greyed: it is the last one known.
      return <RunStatus value={row.run_status} outdated={isObsolete(row.run_date, Date.now())} />;
    case "run_log":
      return <RunLog value={row.run_log} />;
    case "rset_md5":
      return <span className="font-mono whitespace-nowrap">{row.rset_md5}</span>;
    default:
      return row[prop];
  }
}

const COLUMNS: ListColumn<StatusRow>[] = STATUS_PROPS.map((prop) => ({
  prop,
  labelKey: `complianceStatus.fields.${prop}`,
  numeric: prop === "id",
  family: FAMILY[prop],
  filter:
    prop === "run_status" ? { kind: "enum" as const, options: RUN_STATUS_OPTIONS } : undefined,
  render: (row, locale) => renderCell(prop, row, locale),
}));

const ALL_PROPS: string[] = [...STATUS_PROPS];

/**
 * Columns shown, the id, and the date that tells an obsolete check; the joined
 * names are links needing their own id.
 */
function queryProps(cols: string[] | undefined): string {
  const shown = visibleProps(cols, DEFAULT_COLS, ALL_PROPS);
  const extra = [
    ...(shown.includes("nodes.nodename") ? ["node_id"] : []),
    ...(shown.includes("services.svcname") ? ["svc_id"] : []),
  ];
  return [...new Set(["id", "run_date", ...shown, ...extra])].join(",");
}

/** The distribution of a column's values over the selection, with the filters given. */
async function complianceStatusStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/compliance/status", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchComplianceStatus(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/compliance/status", {
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
  const all: StatusRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

/** The counts of the runs the filters select, overall and per `by` when given. */
function useSummary(filters: ColumnFilters, by: Grouping | undefined) {
  return useQuery({
    queryKey: ["compliance-status", "summary", by ?? "", filtersKey(filters)],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await api.GET("/compliance/status/summary", {
        params: { query: { by, filter: filterQuery(filters) } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

/**
 * The share of compliant runs, as a bar and its percent: the bar shows the
 * magnitude, the number says it, for whoever does not read the bar.
 */
function ComplianceRate({ pct }: { pct: number | null }) {
  const { t } = useTranslation();
  if (pct === null) return <span className="text-ink-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden="true"
        className="relative h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums">{t("complianceStatus.pct", { pct })}</span>
    </span>
  );
}

/**
 * The counts of the runs the filters select, as the historical view summed them up
 * above its table: the share of compliant ones, then each state, shaped and named
 * as in the list.
 */
function SummaryStrip({ counts }: { counts: Counts | undefined }) {
  const { t } = useTranslation();
  const tile =
    "flex flex-col gap-1 rounded-(--radius-panel) border border-line bg-surface-raised px-3 py-2";
  const value = (n: number | undefined) => (
    <span className="text-title font-semibold tabular-nums">{n ?? "—"}</span>
  );
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <div className={tile}>
        <span className="text-ink-muted">{t("complianceStatus.summary.compliance")}</span>
        <span className="text-title font-semibold">
          <ComplianceRate pct={counts?.pct ?? null} />
        </span>
        <span className="text-data text-ink-muted">
          {t("complianceStatus.summary.compliant", {
            count: counts === undefined ? 0 : counts.ok + counts.na,
            total: counts?.total ?? 0,
          })}
        </span>
      </div>
      <div className={tile}>
        <StatusBadge state="up" label={t("complianceLogs.status.ok")} />
        {value(counts?.ok)}
      </div>
      <div className={tile}>
        <StatusBadge state="down" label={t("complianceLogs.status.nok")} />
        {value(counts?.nok)}
      </div>
      <div className={tile}>
        <StatusBadge state="unknown" label={t("complianceLogs.status.na")} />
        {value(counts?.na)}
      </div>
      <div
        className={tile}
        title={t("complianceStatus.summary.obsoleteHint", { days: OBSOLETE_DAYS })}
      >
        <StatusBadge state="unknown" label={t("complianceStatus.summary.obsolete")} outdated />
        {value(counts?.obs)}
      </div>
    </div>
  );
}

/** The column of the runs list a group filters on when picked. */
const GROUP_FILTER: Record<Grouping, string> = {
  module: "run_module",
  node: "nodes.nodename",
  service: "services.svcname",
};

/**
 * The counts per module, node or service of the runs the filters select, the least
 * compliant first, as the historical comp_mod_status, comp_node_status and
 * comp_svc_status tables. Picking a total shows the runs of that group.
 */
function Breakdown({
  by,
  filters,
  onPick,
}: {
  by: Grouping;
  filters: ColumnFilters;
  onPick: (group: Group) => void;
}) {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useSummary(filters, by);
  const th = "px-2 py-1.5 text-left font-medium text-ink-muted";
  const num = "px-2 py-1.5 text-right tabular-nums";
  if (isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {error.message}
      </p>
    );
  if (isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (data.data.length === 0)
    return <p className="text-ink-muted">{t("complianceStatus.noRuns")}</p>;
  return (
    <div className="overflow-x-auto rounded-(--radius-panel) border border-line">
      <table className="w-full border-collapse text-data">
        <thead className="border-b border-line bg-surface-raised">
          <tr>
            <th scope="col" className={th}>
              {t(`complianceStatus.by.${by}`)}
            </th>
            <th scope="col" className={`${th} text-right`}>
              {t("complianceStatus.summary.total")}
            </th>
            <th scope="col" className={`${th} text-right`}>
              {t("complianceLogs.status.ok")}
            </th>
            <th scope="col" className={`${th} text-right`}>
              {t("complianceLogs.status.nok")}
            </th>
            <th scope="col" className={`${th} text-right`}>
              {t("complianceLogs.status.na")}
            </th>
            <th scope="col" className={`${th} text-right`}>
              {t("complianceStatus.summary.obsolete")}
            </th>
            <th scope="col" className={th}>
              {t("complianceStatus.summary.compliance")}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((group) => (
            <tr key={group.id} className="border-b border-line last:border-b-0">
              <td className="px-2 py-1.5">
                {by === "module" ? (
                  group.name
                ) : (
                  <CrossLink kind={by} id={group.id}>
                    {group.name}
                  </CrossLink>
                )}
              </td>
              <td className={num}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(group);
                  }}
                  title={t("complianceStatus.showRuns", { name: group.name })}
                  className="underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                >
                  {group.total}
                </button>
              </td>
              <td className={num}>{group.ok}</td>
              <td className={`${num} ${group.nok > 0 ? "font-medium text-state-down" : ""}`}>
                {group.nok}
              </td>
              <td className={num}>{group.na}</td>
              <td className={num}>{group.obs}</td>
              <td className="px-2 py-1.5">
                <ComplianceRate pct={group.pct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The last check of each compliance module, on each node and on each service
 * instance, of the nodes the user can see, as the historical compliance status
 * view: the counts of the selection by state, then the runs, or their counts per
 * module, node or service. The filters of the runs narrow the counts too, and the
 * session filterset all of them. Read-only.
 */
export function ComplianceStatusPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("complianceStatus");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/compliance/status" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/compliance/status" });
  const [section, setSection] = useState<Section>("runs");

  const runs = useQuery({
    queryKey: [
      "compliance-status",
      "runs",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    placeholderData: keepPreviousData,
    queryFn: () => fetchComplianceStatus(search),
  });
  const summary = useSummary(search.filters, undefined);
  // The runs checked, and those just deleted, for the list to untick them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  // Names from the page on display, the module and where it ran: a selection
  // extended to the following pages does not have them all, so the id then serves as
  // a fallback in the messages.
  const names = new Map<string, string>();
  for (const row of runs.data?.rows ?? []) {
    if (row.id === undefined || row.run_module === undefined) continue;
    const where = [row["nodes.nodename"], row["services.svcname"]].filter(
      (name): name is string => typeof name === "string" && name !== "",
    );
    names.set(String(row.id), [row.run_module, ...where].join(" · "));
  }

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/compliance/status", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: StatusRow[] = Array.isArray(data.data) ? data.data : [];
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

  /** Another tab: the list of the runs comes back without the rows it had checked. */
  function showSection(next: Section) {
    setSelectedIds([]);
    setSection(next);
  }

  /** The runs of a group: its filter on the list, then the list. */
  function pick(by: Grouping, group: Group) {
    update({
      filters: withFilter(search.filters, GROUP_FILTER[by], fromPickedValues([group.name])),
      offset: 0,
    });
    showSection("runs");
  }

  const tabs = (["runs", "module", "node", "service"] as const).map((key) => ({
    key,
    label: t(`complianceStatus.sections.${key}`),
    mark:
      key === "runs" && summary.data !== undefined ? (
        <CategoryCount count={summary.data.totals.total} />
      ) : undefined,
  }));

  return (
    <section>
      {/* As tall as the Actions button from the start: checking a row must not push the list down. */}
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="complianceStatus" className="h-5 w-5" />
          {t("complianceStatus.title")}
        </h1>
        {/* On the runs checked in the list, which only the Runs tab shows. */}
        {section === "runs" && (
          <SelectionDeleteMenu
            targets={selectedIds.map((id) => ({ id, name: names.get(id) ?? id }))}
            prefix="complianceStatus.actions"
            privileges={["CompExec"]}
            remove={async (id) => {
              const { error } = await api.DELETE("/compliance/status/{status_id}", {
                params: { path: { status_id: id } },
              });
              return error === undefined ? null : problemText(error);
            }}
            // The counts and the breakdowns follow the runs.
            invalidate={[["compliance-status"]]}
            onDeleted={setDeleted}
          />
        )}
      </div>

      {summary.isError ? (
        <p role="alert" className="mb-4 text-state-down">
          ■ {summary.error.message}
        </p>
      ) : (
        <SummaryStrip counts={summary.data?.totals} />
      )}

      <div className="mb-3">
        <CategoryTabs
          label={t("complianceStatus.sectionsLabel")}
          idPrefix="compliance-status"
          tabs={tabs}
          active={section}
          onSelect={showSection}
        />
      </div>

      <div
        role="tabpanel"
        id={`compliance-status-panel-${section}`}
        aria-labelledby={`compliance-status-tab-${section}`}
      >
        {section === "runs" ? (
          <CollectorList
            columns={COLUMNS}
            defaultCols={DEFAULT_COLS}
            rows={runs.data?.rows ?? []}
            rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
            search={search}
            onChange={update}
            isPending={runs.isPending}
            isFetching={runs.isFetching}
            errorMessage={runs.isError ? runs.error.message : null}
            hasMore={runs.data?.hasMore ?? false}
            exportPage={(page) => fetchComplianceStatus({ ...search, ...page })}
            total={runs.data?.total}
            selectAllMatching={allIds}
            onSelectionChange={setSelectedIds}
            unselect={deleted}
            valueStats={complianceStatusStats}
            filterable
          />
        ) : (
          <Breakdown
            by={section}
            filters={search.filters}
            onPick={(group) => {
              pick(section, group);
            }}
          />
        )}
      </div>
    </section>
  );
}
