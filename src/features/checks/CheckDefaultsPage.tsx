import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toPage } from "@/lib/api/page";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { SelectionDeleteMenu } from "@/components/opensvc/SelectionDeleteMenu";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey, type ColumnFilters } from "@/lib/column-filters";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { CheckDefaultDetailPanel } from "./CheckDefaultDetailPanel";
import { CreateCheckDefaultPanel } from "./CreateCheckDefaultPanel";

type CheckDefaultRow = components["schemas"]["CheckDefaultRow"];

/** As the historical table (`table_checks_defaults`). */
const DEFAULT_SORT = ["chk_type", "chk_inst", "chk_prio"];

const PROPS = [
  "id",
  "chk_type",
  "chk_inst",
  "chk_prio",
  "chk_low",
  "chk_high",
] as const satisfies readonly (keyof CheckDefaultRow)[];

const DEFAULT_COLS: string[] = ["chk_type", "chk_inst", "chk_prio", "chk_low", "chk_high"];

const NUMERIC_PROPS = new Set<string>(["id", "chk_prio", "chk_low", "chk_high"]);

const FAMILY: Record<string, ColumnFamily> = {
  id: "state",
  chk_type: "state",
  chk_inst: "state",
  chk_prio: "state",
  chk_low: "alert",
  chk_high: "alert",
};

const COLUMNS: ListColumn<CheckDefaultRow>[] = PROPS.map((prop) => ({
  prop,
  labelKey: `checkDefaults.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "state",
  render: (row: CheckDefaultRow) => {
    if (prop === "chk_inst") return <code>{row.chk_inst}</code>;
    return row[prop];
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

async function fetchDefaults(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/checks/defaults", {
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
  const all: CheckDefaultRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

/**
 * The distribution of a column's values over the default thresholds the filters given keep,
 * for its filter: the pagination does not apply.
 */
async function checkDefaultStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/checks/defaults", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

/**
 * The default thresholds of the check types, the historical "Checks defaults"
 * view: a check takes, among the defaults of its type whose instance pattern
 * matches its instance, the one of the highest priority, then of the longest
 * pattern, unless thresholds of its own or contextual ones apply. CheckManager
 * adds, edits and deletes them.
 */
export function CheckDefaultsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("check-defaults");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/checks/defaults" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/checks/defaults" });
  const privileges = useEffectivePrivileges();
  const manager = privileges.data !== undefined && hasPrivilege(privileges.data, ["CheckManager"]);
  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: [
      "check-defaults",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    placeholderData: keepPreviousData,
    queryFn: () => fetchDefaults(search),
  });
  const [creating, setCreating] = useState(false);
  // The rows checked, and those just deleted, for the list to untick them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const names = new Map<string, string>();
  for (const row of data?.rows ?? []) {
    if (row.id === undefined || row.chk_type === undefined) continue;
    names.set(
      String(row.id),
      row.chk_inst === undefined || row.chk_inst === ""
        ? row.chk_type
        : `${row.chk_type}:${row.chk_inst}`,
    );
  }

  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/checks/defaults", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: CheckDefaultRow[] = Array.isArray(data.data) ? data.data : [];
    return rows.flatMap((row) => (row.id === undefined ? [] : [String(row.id)]));
  }

  function update(next: Partial<ResolvedListSearch>) {
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  return (
    <section>
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="check" className="h-5 w-5" />
          {t("checkDefaults.title")}
        </h1>
        {manager && (
          <button
            type="button"
            onClick={() => {
              // The drawers share the right edge: opening the creation closes the detail.
              update({ sel: undefined });
              setCreating(true);
            }}
            className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
          >
            {t("checkDefaults.create.open")}
          </button>
        )}
        {/* On the rows checked in the list; nothing checked, no menu. */}
        <SelectionDeleteMenu
          targets={selectedIds.map((id) => ({ id, name: names.get(id) ?? id }))}
          prefix="checkDefaults.actions"
          privileges={["CheckManager"]}
          remove={async (id) => {
            const { error } = await api.DELETE("/checks/defaults/{id}", {
              params: { path: { id: Number(id) } },
            });
            return error === undefined ? null : problemText(error);
          }}
          invalidate={[["check-defaults"]]}
          onDeleted={(ids) => {
            setDeleted(ids);
            if (search.sel !== undefined && ids.includes(search.sel)) update({ sel: undefined });
          }}
        />
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("checkDefaults.intro")}</p>

      <CollectorList
        viewPrefs={prefs}
        valueStats={checkDefaultStats}
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
        exportPage={(page) => fetchDefaults({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        onSelectionChange={setSelectedIds}
        unselect={deleted}
        filterable
      />

      <CheckDefaultDetailPanel
        defaultId={search.sel}
        label={search.sel === undefined ? "" : (names.get(search.sel) ?? "")}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
      <CreateCheckDefaultPanel
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onCreated={(id) => {
          update({ sel: String(id) });
        }}
      />
    </section>
  );
}
