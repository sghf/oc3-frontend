import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { FLAG_FILTER_OPTIONS } from "@/components/opensvc/filter-options";
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
import { CreateUserPanel } from "./CreateUserPanel";
import { UserDetailPanel } from "./UserDetailPanel";

type UserRow = components["schemas"]["UserRow"];

const DEFAULT_SORT = ["email"];

/**
 * User properties exposed by apicollector, in the order of its
 * `meta.available_props`, but `registration_id`, the account's identifier at an
 * external identity provider, of no use in a list. The credentials (password,
 * registration and password reset keys) are not exposed by the API.
 */
const USER_PROPS = [
  "id",
  "username",
  "email",
  "first_name",
  "last_name",
  "phone_work",
  "im_type",
  "im_username",
  "email_notifications",
  "im_notifications",
  "email_log_level",
  "im_log_level",
  "email_notifications_delay",
  "im_notifications_delay",
  "lock_filter",
  "quota_app",
  "quota_org_group",
  "quota_docker_registries",
] as const satisfies readonly (keyof UserRow)[];

/** Default columns: enough to recognise someone and to reach them. */
const DEFAULT_COLS: string[] = ["email", "first_name", "last_name", "phone_work"];

/**
 * Numeric columns, aligned right. apicollector returns delays and quotas as strings
 * (the `colStr` helper), but they are numbers on screen.
 */
const NUMERIC_PROPS = new Set<string>([
  "id",
  "email_notifications_delay",
  "im_notifications_delay",
  "quota_app",
  "quota_org_group",
  "quota_docker_registries",
]);

const FAMILY: Record<string, ColumnFamily> = {
  id: "team",
  username: "team",
  email: "team",
  first_name: "team",
  last_name: "team",
  phone_work: "team",
  im_type: "team",
  im_username: "team",
  email_notifications: "alert",
  im_notifications: "alert",
  email_log_level: "alert",
  im_log_level: "alert",
  email_notifications_delay: "alert",
  im_notifications_delay: "alert",
  lock_filter: "security",
  quota_app: "app",
  quota_org_group: "team",
  quota_docker_registries: "service",
};

/** Columns holding a T/F flag of the collector. */
const FLAG_PROPS = new Set<string>(["email_notifications", "im_notifications", "lock_filter"]);

const COLUMNS: ListColumn<UserRow>[] = USER_PROPS.map((prop) => ({
  prop,
  labelKey: `users.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "team",
  filter: FLAG_PROPS.has(prop) ? { kind: "enum", options: FLAG_FILTER_OPTIONS } : undefined,
  render: (row: UserRow) => row[prop],
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/** Ask only for the columns shown, plus the id used by the detail. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/**
 * The list is filtered server side according to the caller: a Manager or a
 * UserManager sees everyone, the others see only themselves and the members of their
 * organisation groups.
 */
/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchUsers(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/users", {
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
  const all: UserRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useUsers(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "users",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchUsers(search),
  });
}

export function UsersPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("users");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/users" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/users" });
  const { data, isPending, isError, error, isFetching } = useUsers(search);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/users", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(JSON.stringify(error));
    const rows: UserRow[] = Array.isArray(data.data) ? data.data : [];
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

  const [creating, setCreating] = useState(false);
  const selected = data?.rows.find((row) => String(row.id) === search.sel);

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="user" className="h-5 w-5" />
          {t("users.title")}
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
          {t("users.create.open")}
        </button>
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
        exportPage={(page) => fetchUsers({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />

      <CreateUserPanel
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onCreated={(id) => {
          // The new user opens in the detail.
          if (id !== undefined) update({ sel: String(id) });
        }}
      />

      <UserDetailPanel
        userId={creating ? undefined : search.sel}
        label={selected?.email ?? ""}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
