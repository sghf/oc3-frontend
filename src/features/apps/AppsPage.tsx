import { useState } from "react";
import { DateTime } from "@/components/ui/DateTime";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey } from "@/lib/column-filters";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { AppDetailPanel } from "./AppDetailPanel";
import { CreateAppPanel } from "./CreateAppPanel";

type AppRow = components["schemas"]["AppRow"];

const DEFAULT_SORT = ["app"];

/**
 * Every application code property exposed by apicollector, in the order of its
 * `meta.available_props`. `satisfies` confronts them with the generated schema.
 */
const APP_PROPS = [
  "id",
  "app",
  "description",
  "app_domain",
  "app_team_ops",
  "updated",
] as const satisfies readonly (keyof AppRow)[];

/** Columns shown by default: the code, what it names, and how fresh it is. */
const DEFAULT_COLS: string[] = ["app", "description", "updated"];

/** `id` comes from the `col` helper on an integer column: aligned right. */
const NUMERIC_PROPS = new Set<string>(["id"]);

/** Props the collector stores as datetime. */
const DATE_PROPS = new Set<string>(["updated"]);

/** Family of each column, in the vocabulary of the historical collector. */
const FAMILY: Record<string, ColumnFamily> = {
  id: "app",
  app: "app",
  description: "app",
  app_domain: "app",
  app_team_ops: "team",
  updated: "time",
};

const COLUMNS: ListColumn<AppRow>[] = APP_PROPS.map((prop) => ({
  prop,
  labelKey: `apps.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "node",
  render: (row: AppRow, locale: string) => {
    const value = row[prop];
    if (DATE_PROPS.has(prop) && typeof value === "string")
      return <DateTime value={value} locale={locale} />;
    return value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/** Ask only for the columns shown: apicollector pushes the selection down to the database. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", "app", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchApps(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/apps", {
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
  const all: AppRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useApps(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "apps",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchApps(search),
  });
}

export function AppsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("apps");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/apps" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/apps" });
  const { data, isPending, isError, error, isFetching } = useApps(search);
  const [creating, setCreating] = useState(false);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/apps", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(JSON.stringify(error));
    const rows: AppRow[] = Array.isArray(data.data) ? data.data : [];
    return rows
      .map((row) => row.id)
      .filter((id): id is number => id !== undefined)
      .map(String);
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

  // The code names the row: it is what the other views carry, and the API accepts
  // `GET /apps/DEV` as well as the integer id. A link already shared as `?sel="<id>"`
  // therefore still opens the right record, without highlighting its row. The router
  // reads an unquoted `sel` as a number and discards it, which is true of every view
  // with an integer id: see notes.md.
  const selected = data?.rows.find(
    (row) => row.app === search.sel || String(row.id) === search.sel,
  );

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="app" className="h-5 w-5" />
          {t("apps.title")}
        </h1>
        <button
          type="button"
          onClick={() => {
            // The two drawers share the right edge: opening the creation closes the detail.
            update({ sel: undefined });
            setCreating(true);
          }}
          className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
        >
          {t("apps.create.open")}
        </button>
      </div>

      <CollectorList
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => row.app}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchApps({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <AppDetailPanel
        appId={creating ? undefined : search.sel}
        label={selected?.app ?? ""}
        onClose={() => {
          update({ sel: undefined });
        }}
      />

      <CreateAppPanel
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </section>
  );
}
