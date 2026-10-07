import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { YamlCode } from "@/components/ui/YamlCode";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey } from "@/lib/column-filters";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { ReportCreatePanel } from "./ReportCreatePanel";
import { ReportDetailPanel } from "./ReportDetailPanel";

type ReportRow = components["schemas"]["ReportRow"];

/** By name, as the historical table. */
const DEFAULT_SORT = ["report_name"];

/** The columns of the historical reports table, in its order. */
const REPORT_PROPS = [
  "id",
  "report_name",
  "report_yaml",
] as const satisfies readonly (keyof ReportRow)[];

/** Default columns: those of the historical table (`default_columns`). */
const DEFAULT_COLS: string[] = ["report_name", "report_yaml"];

/** Lines of a definition shown in its cell; the rest is counted. */
const DEFINITION_LINES = 8;

function columns(t: TFunction): ListColumn<ReportRow>[] {
  return REPORT_PROPS.map((prop) => ({
    prop,
    labelKey: `reports.fields.${prop}`,
    numeric: prop === "id",
    family: prop === "report_yaml" ? "alert" : "state",
    render: (row: ReportRow) => {
      if (prop === "report_yaml")
        // The first lines of the definition as YAML: the whole of it is in the detail.
        return row.report_yaml === undefined || row.report_yaml.trim() === "" ? (
          <span className="text-ink-muted italic">{t("reports.definitionEmpty")}</span>
        ) : (
          <YamlCode
            text={row.report_yaml}
            maxLines={DEFINITION_LINES}
            moreLabel={(count) => t("reports.definitionMore", { count })}
          />
        );
      return row[prop];
    },
  }));
}

const ALL_PROPS = [...REPORT_PROPS];

/** Columns shown, plus the id used by the detail. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchReports(search: ResolvedListSearch) {
  // One row more than the page: whether another page follows.
  const { data, error } = await api.GET("/reports", {
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
  const all: ReportRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useReports(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "reports",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchReports(search),
  });
}

/**
 * The reports: pages of charts and metrics, defined in YAML, as in the historical
 * collector's administration (`adm-reports`). A Manager sees them all, the others
 * those published to one of their teams. Creating one requires the ReportsManager
 * privilege; the interface does not know the caller's privileges and shows the
 * server's refusal. A report is not edited here yet: its detail is read-only.
 */
export function ReportsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("reports");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/reports" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/reports" });
  const { data, isPending, isError, error, isFetching } = useReports(search);
  const [creating, setCreating] = useState(false);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/reports", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: ReportRow[] = Array.isArray(data.data) ? data.data : [];
    return rows.flatMap((row) => (row.id === undefined ? [] : [String(row.id)]));
  }

  function update(next: Partial<ResolvedListSearch>) {
    // Choosing a row ends a creation in progress: the row's detail takes the right
    // edge, where the two drawers would otherwise overlap.
    if (next.sel !== undefined) setCreating(false);
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
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="report" className="h-5 w-5" />
          {t("reports.title")}
        </h1>
        <button
          type="button"
          onClick={() => {
            // The drawers share the right edge: opening the creation closes the detail.
            update({ sel: undefined });
            setCreating(true);
          }}
          className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
        >
          {t("reports.form.open")}
        </button>
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("reports.intro")}</p>

      <CollectorList
        columns={columns(t)}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchReports({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <ReportDetailPanel
        reportId={creating ? undefined : search.sel}
        label={selected?.report_name ?? ""}
        onClose={() => {
          update({ sel: undefined, tab: undefined });
        }}
        tab={search.tab}
        onTabChange={(tab) => {
          update({ tab });
        }}
      />

      <ReportCreatePanel
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onCreated={(id) => {
          // The new report opens in the detail.
          if (id !== undefined) update({ sel: String(id) });
        }}
      />
    </section>
  );
}
