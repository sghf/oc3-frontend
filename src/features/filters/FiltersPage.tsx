import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { SelectionDeleteMenu } from "@/components/opensvc/SelectionDeleteMenu";
import { usageWarnings } from "@/components/opensvc/usage-warnings";
import { problemText } from "@/lib/api/problem";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
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
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { FilterDetailPanel } from "./FilterDetailPanel";
import { FilterFormPanel } from "./FilterFormPanel";
import { useFilter } from "./use-filter";
import { FILTER_OPERATORS } from "./filter-definition";

type FilterRow = components["schemas"]["FilterRow"];

/** Grouped by table then by column: the filters of one column follow each other. */
const DEFAULT_SORT = ["f_table", "f_field", "f_value"];

const FILTER_PROPS = [
  "f_label",
  "f_table",
  "f_field",
  "f_op",
  "f_value",
  "f_author",
  "f_updated",
  "id",
  "f_cksum",
] as const satisfies readonly (keyof FilterRow)[];

/** Default columns: the definition, and who touched it last. */
const DEFAULT_COLS: string[] = ["f_table", "f_field", "f_op", "f_value", "f_author", "f_updated"];

const NUMERIC_PROPS = new Set<string>(["id"]);

const FAMILY: Record<string, ColumnFamily> = {
  f_label: "state",
  f_table: "state",
  f_field: "state",
  f_op: "state",
  f_value: "state",
  f_author: "team",
  f_updated: "time",
  id: "state",
  f_cksum: "state",
};

/** The operators a filter may use: the value is its own label. */
const OPERATOR_OPTIONS: ColumnFilterOption[] = FILTER_OPERATORS.map((value) => ({ value }));

const COLUMNS: ListColumn<FilterRow>[] = FILTER_PROPS.map((prop) => ({
  prop,
  labelKey: `filters.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "state",
  filter: prop === "f_op" ? { kind: "enum", options: OPERATOR_OPTIONS } : undefined,
  render: (row: FilterRow) => {
    if (prop === "f_updated") return <DateTime value={row.f_updated} />;
    // The operator and the value read in a monospace font: a space or a LIKE "%" must
    // not go unnoticed.
    if (prop === "f_op" || prop === "f_value")
      return <code className="whitespace-pre">{row[prop]}</code>;
    return row[prop];
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchFilters(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/filters", {
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
  const all: FilterRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

/**
 * The distribution of a column's values over the filters the filters given keep,
 * for its filter: the pagination does not apply.
 */
async function filterStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/filters", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

function useFilters(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "filters",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchFilters(search),
  });
}

export function FiltersPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("filters");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/filters" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/filters" });
  const { data, isPending, isError, error, isFetching } = useFilters(search);
  // The rows checked, and those just deleted, for the list to untick them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  // Names from the page on display: a selection extended to the following pages does
  // not have them all, so the id then serves as a fallback in the messages.
  const names = new Map<string, string>();
  for (const row of data?.rows ?? []) {
    const id = row.id === undefined ? undefined : String(row.id);
    // The label when its column is shown, else the definition, which the default
    // columns hold, as the label writes it.
    const label =
      row.f_label ??
      (row.f_table === undefined || row.f_field === undefined
        ? undefined
        : `${row.f_table}.${row.f_field} ${row.f_op ?? ""} ${row.f_value ?? ""}`.trim());
    if (id !== undefined && label !== undefined) names.set(id, label);
  }
  // A single form: creation when nothing is selected, editing otherwise.
  const [form, setForm] = useState<"create" | "edit" | null>(null);
  const selectedFilter = useFilter(form === "edit" ? search.sel : undefined);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/filters", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(JSON.stringify(error));
    const rows: FilterRow[] = Array.isArray(data.data) ? data.data : [];
    return rows
      .map((row) => row.id)
      .filter((id): id is number => id !== undefined)
      .map(String);
  }

  function update(next: Partial<ResolvedListSearch>) {
    // Choosing a row ends a creation in progress: the row's detail takes the right
    // edge, where the two drawers would otherwise overlap.
    if (next.sel !== undefined) {
      if (form === "create") setForm(null);
    }
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
          <ObjectIcon kind="filter" className="h-5 w-5" />
          {t("filters.title")}
        </h1>
        <button
          type="button"
          onClick={() => {
            // The drawers share the right edge: opening the creation closes the detail.
            update({ sel: undefined });
            setForm("create");
          }}
          className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
        >
          {t("filters.form.open")}
        </button>
        {/* On the rows checked in the list; nothing checked, no menu. */}
        <SelectionDeleteMenu
          targets={selectedIds.map((id) => ({ id, name: names.get(id) ?? id }))}
          prefix="filters.actions"
          privileges={["CompManager"]}
          remove={async (id) => {
            const { error } = await api.DELETE("/filters/{filter_id}", {
              params: { path: { filter_id: id } },
            });
            return error === undefined ? null : problemText(error);
          }}
          invalidate={[["filters"], ["filterset"], ["filtersets"]]}
          warnings={(targets) =>
            usageWarnings(
              targets,
              async (id) => {
                const { data, error } = await api.GET("/filters/{filter_id}/usage", {
                  params: { path: { filter_id: id } },
                });
                if (error !== undefined) throw new Error(problemText(error));
                return data.data.filtersets.length;
              },
              (target, uses) =>
                t("filters.actions.data.delete.used", { name: target.name, count: uses }),
            )
          }
          onDeleted={(ids) => {
            setDeleted(ids);
            // The detail of a deleted object has nothing left to show.
            if (search.sel !== undefined && ids.includes(search.sel)) update({ sel: undefined });
          }}
        />
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("filters.intro")}</p>

      <CollectorList
        viewPrefs={prefs}
        valueStats={filterStats}
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
        exportPage={(page) => fetchFilters({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        onSelectionChange={setSelectedIds}
        unselect={deleted}
        filterable
      />

      <FilterDetailPanel
        filterId={form === null ? search.sel : undefined}
        label={selected?.f_label ?? ""}
        onClose={() => {
          update({ sel: undefined });
        }}
        onEdit={() => {
          setForm("edit");
        }}
      />

      <FilterFormPanel
        open={form === "create" || (form === "edit" && selectedFilter.data !== undefined)}
        filter={form === "edit" ? selectedFilter.data : undefined}
        onClose={() => {
          setForm(null);
        }}
        onSaved={(id) => {
          // After a creation, the new filter opens in the detail.
          if (form === "create" && id !== undefined) update({ sel: String(id) });
        }}
      />
    </section>
  );
}
