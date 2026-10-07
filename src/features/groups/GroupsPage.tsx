import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
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
import { CreateGroupPanel } from "./CreateGroupPanel";
import { GroupDetailPanel } from "./GroupDetailPanel";

type GroupRow = components["schemas"]["GroupRow"];

const DEFAULT_SORT = ["role"];

/**
 * Every group property exposed by apicollector, in the order of its
 * `meta.available_props`. `satisfies` confronts them with the generated schema.
 */
const GROUP_PROPS = [
  "id",
  "role",
  "privilege",
  "description",
] as const satisfies readonly (keyof GroupRow)[];

/** Default columns: the name, the nature and what the group names. */
const DEFAULT_COLS: string[] = ["role", "privilege", "description"];

/** `id` comes from the `col` helper on an integer column: aligned right. */
const NUMERIC_PROPS = new Set<string>(["id"]);

/** Family of each column: a group gathers people. */
const FAMILY: Record<string, ColumnFamily> = {
  id: "team",
  role: "team",
  privilege: "security",
  description: "team",
};

const ALL_PROPS = [...GROUP_PROPS];

/** The flag of a group, named as the column shows it. */
const PRIVILEGE_OPTIONS: ColumnFilterOption[] = ["T", "F"].map((value) => ({
  value,
  labelKey: `groups.privilege.${value}`,
}));

/** Ask only for the columns shown: apicollector pushes the selection down to the database. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchGroups(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/groups", {
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
  const all: GroupRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useGroups(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "groups",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchGroups(search),
  });
}

export function GroupsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("groups");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/groups" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/groups" });
  const { data, isPending, isError, error, isFetching } = useGroups(search);
  const [creating, setCreating] = useState(false);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/groups", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(JSON.stringify(error));
    const rows: GroupRow[] = Array.isArray(data.data) ? data.data : [];
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

  // The letter stored in the database says nothing on screen: its nature is shown.
  const columns: ListColumn<GroupRow>[] = GROUP_PROPS.map((prop) => ({
    prop,
    labelKey: `groups.fields.${prop}`,
    numeric: NUMERIC_PROPS.has(prop),
    family: FAMILY[prop] ?? "team",
    filter:
      prop === "privilege" ? { kind: "enum" as const, options: PRIVILEGE_OPTIONS } : undefined,
    render: (row: GroupRow) =>
      prop === "privilege" && row.privilege !== undefined
        ? t(`groups.privilege.${row.privilege}`)
        : row[prop],
  }));

  const selected = data?.rows.find((row) => String(row.id) === search.sel);

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="group" className="h-5 w-5" />
          {t("groups.title")}
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
          {t("groups.create.open")}
        </button>
      </div>

      <CollectorList
        columns={columns}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchGroups({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <GroupDetailPanel
        groupId={creating ? undefined : search.sel}
        label={selected?.role ?? ""}
        onClose={() => {
          update({ sel: undefined });
        }}
      />

      <CreateGroupPanel
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </section>
  );
}
