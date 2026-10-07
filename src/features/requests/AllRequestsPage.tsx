import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { StatusBadge, type ObjectState } from "@/components/opensvc/StatusBadge";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { DateTime } from "@/components/ui/DateTime";
import { RelativeTime } from "@/components/ui/RelativeTime";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ListSearch,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey } from "@/lib/column-filters";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";

type WorkflowRow = components["schemas"]["WorkflowRow"];

/** The requests whose last step is the most recent first, as the historical table. */
const DEFAULT_SORT = ["-last_form_id"];

/**
 * Request properties exposed by apicollector, in the order of the historical
 * workflows table. `satisfies` confronts them with the generated schema.
 */
const REQUEST_PROPS = [
  "form_head_id",
  "form_name",
  "last_form_id",
  "last_form_name",
  "form_folder",
  "status",
  "steps",
  "creator",
  "last_assignee",
  "create_date",
  "last_update",
  "form_yaml",
  "id",
  "form_md5",
] as const satisfies readonly (keyof WorkflowRow)[];

/** The default columns of the historical workflows table. */
const DEFAULT_COLS: string[] = [
  "form_head_id",
  "form_name",
  "last_form_id",
  "last_form_name",
  "status",
  "steps",
  "creator",
  "last_assignee",
  "create_date",
  "last_update",
];

/**
 * Status of a request: pending while a next step awaits its assignee, closed once
 * the last step is done. A shape and a label, not the tint alone.
 */
const STATUS: Record<string, ObjectState> = { pending: "warn", closed: "unknown" };
const STATUS_OPTIONS: ColumnFilterOption[] = Object.keys(STATUS).map((value) => ({
  value,
  labelKey: `allRequests.status.${value}`,
}));

const FAMILY: Record<string, ColumnFamily> = {
  status: "state",
  creator: "team",
  last_assignee: "team",
  create_date: "time",
  last_update: "time",
};

const NUMERIC_PROPS = new Set<string>(["form_head_id", "last_form_id", "steps", "id"]);

function columns(t: (key: string) => string): ListColumn<WorkflowRow>[] {
  return REQUEST_PROPS.map((prop) => ({
    prop,
    labelKey: `allRequests.fields.${prop}`,
    numeric: NUMERIC_PROPS.has(prop),
    family: FAMILY[prop] ?? "app",
    filter: prop === "status" ? { kind: "enum" as const, options: STATUS_OPTIONS } : undefined,
    render: (row: WorkflowRow, locale: string) => {
      const value = row[prop];
      if (prop === "status" && typeof value === "string")
        return (
          <StatusBadge
            state={STATUS[value] ?? "unknown"}
            label={value in STATUS ? t(`allRequests.status.${value}`) : value}
          />
        );
      if (prop === "create_date" && typeof value === "string")
        return <DateTime value={value} locale={locale} />;
      // Date of the latest step: its age reads better as a distance.
      if (prop === "last_update" && typeof value === "string")
        return <RelativeTime value={value} locale={locale} />;
      if (prop === "form_yaml" && typeof value === "string")
        return <pre className="max-h-32 overflow-auto text-data">{value}</pre>;
      // A creator or an assignee without a first name starts with a space.
      if (typeof value === "string") return value.trim();
      return value;
    },
  }));
}

const ALL_PROPS: string[] = [...REQUEST_PROPS];

/** Columns shown, plus the row id. */
function queryProps(cols: string[] | undefined): string {
  return [...new Set(["id", ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS)])].join(",");
}

/** Which requests a list shows: all, or the historical team views. */
type Assigned = "team" | "tiers" | undefined;

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchRequests(search: ResolvedListSearch, assigned: Assigned) {
  const { data, error } = await api.GET("/workflows", {
    params: {
      query: {
        props: queryProps(search.cols),
        orderby: search.sort.join(","),
        offset: search.offset,
        limit: search.limit + 1,
        filter: filterQuery(search.filters),
        assigned,
      },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  const all: WorkflowRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useRequests(search: ResolvedListSearch, assigned: Assigned) {
  return useQuery({
    queryKey: [
      "workflows",
      assigned,
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchRequests(search, assigned),
  });
}

/**
 * A list of requests: one row per workflow started by the submission of a form
 * with a workflow output, with its status, its steps and who it awaits. Read-only;
 * the rows are filtered and sorted by the server. Each view keeps its own columns,
 * sort and filters (`prefsKey`); the route that shows it passes its URL state.
 */
function RequestsList({
  view,
  assigned,
  rawSearch,
  navigate,
}: {
  view: "allRequests" | "teamRequests" | "tiersRequests";
  assigned: Assigned;
  rawSearch: ListSearch;
  navigate: (next: Partial<ResolvedListSearch>) => void;
}) {
  const { t } = useTranslation();
  const prefs = useViewPrefs(view);
  const search = resolveListSearch(withSavedSearch(rawSearch, prefs), DEFAULT_SORT);
  const { data, isPending, isError, error, isFetching } = useRequests(search, assigned);

  /** Ids of the whole selection, filters included, without pagination. */
  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/workflows", {
      params: {
        query: { props: "id", limit: 0, filter: filterQuery(search.filters), assigned },
      },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: WorkflowRow[] = Array.isArray(data.data) ? data.data : [];
    return rows.flatMap((row) => (row.id === undefined ? [] : [String(row.id)]));
  }

  function update(next: Partial<ResolvedListSearch>) {
    // Columns, sort, filters and page size follow the account, the other states
    // stay in the URL.
    prefs.saveSearch(next);
    navigate(next);
  }

  return (
    <section>
      <h1 className="mb-1 flex items-center gap-2 text-title font-semibold">
        <ObjectIcon kind="form" className="h-5 w-5" />
        {t(`${view}.title`)}
      </h1>
      <p className="mb-3 max-w-3xl text-ink-muted">{t(`${view}.intro`)}</p>

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
        exportPage={(page) => fetchRequests({ ...search, ...page }, assigned)}
        total={data?.total}
        selectAllMatching={allIds}
        filterable
      />
    </section>
  );
}

/**
 * The requests the user or their teams take part in, every one for a Manager: the
 * historical `req-all`, which listed every request to anyone.
 */
export function AllRequestsPage() {
  const navigate = useNavigate({ from: "/requests/all" });
  return (
    <RequestsList
      view="allRequests"
      assigned={undefined}
      rawSearch={useSearch({ from: "/requests/all" })}
      navigate={(next) => {
        void navigate({
          search: (previous) => mergeSearch(previous, next),
          resetScroll: resetsScroll(next),
        });
      }}
    />
  );
}

/**
 * The pending requests awaiting the user or one of their groups: the historical
 * "Assigned to my team" (`req-pending-my`).
 */
export function TeamRequestsPage() {
  const navigate = useNavigate({ from: "/requests/team" });
  return (
    <RequestsList
      view="teamRequests"
      assigned="team"
      rawSearch={useSearch({ from: "/requests/team" })}
      navigate={(next) => {
        void navigate({
          search: (previous) => mergeSearch(previous, next),
          resetScroll: resetsScroll(next),
        });
      }}
    />
  );
}

/**
 * The pending requests started by the user or one of their groups and awaiting
 * someone else: the historical "Pending tiers action" (`req-pending-tiers`).
 */
export function TiersRequestsPage() {
  const navigate = useNavigate({ from: "/requests/tiers" });
  return (
    <RequestsList
      view="tiersRequests"
      assigned="tiers"
      rawSearch={useSearch({ from: "/requests/tiers" })}
      navigate={(next) => {
        void navigate({
          search: (previous) => mergeSearch(previous, next),
          resetScroll: resetsScroll(next),
        });
      }}
    />
  );
}
