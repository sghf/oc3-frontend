import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import {
  CollectorList,
  type ColumnFilterOption,
  type ListColumn,
} from "@/components/opensvc/CollectorList";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
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
import { ActionDetailPanel } from "./ActionDetailPanel";
import { ActionQueueMenu } from "./ActionQueueMenu";
import { ACTION_PROPS, isPending, realDate, toActionRows, type ActionRow } from "./action-row";
import { stripAnsi } from "@/lib/ansi";

/** The queue reads from the most recent to the oldest, like the log. */
const DEFAULT_SORT = ["-id"];

const DEFAULT_COLS: string[] = [
  "status",
  "command",
  "nodes.nodename",
  "services.svcname",
  "date_queued",
  "date_dequeued",
  "ret",
];

const FAMILY: Record<string, ColumnFamily> = {
  id: "state",
  status: "state",
  command: "state",
  "nodes.nodename": "node",
  "services.svcname": "service",
  action_type: "state",
  connect_to: "network",
  date_queued: "time",
  date_dequeued: "time",
  ret: "alert",
  stdout: "alert",
  stderr: "alert",
  node_id: "node",
  svc_id: "service",
};

/** Agent output: useful in the panel, unreadable in a table cell. */
const LONG_PROPS = new Set(["stdout", "stderr"]);

/**
 * State of an action, from the point of view of whoever looks at it: waiting as long
 * as the agent has not taken it, then according to its return code. The codes of the
 * old collector are kept as they are, for want of labels in the API.
 */
function statusState(row: ActionRow): "up" | "warn" | "down" | "unknown" {
  if (isPending(row.status)) return "warn";
  if (row.status === "C") return "unknown";
  return row.ret === "0" ? "up" : "down";
}

/** Codes of the old collector's queue, named in the filter; the cells show the code. */
const STATUS_OPTIONS: ColumnFilterOption[] = ["W", "Q", "R", "T", "C"].map((value) => ({
  value,
  labelKey: `actions.statusNames.${value}`,
}));

const COLUMNS: ListColumn<ActionRow>[] = ACTION_PROPS.map((prop) => ({
  prop,
  labelKey: `actions.fields.${prop}`,
  numeric: prop === "id" || prop === "ret",
  family: FAMILY[prop] ?? "state",
  // `orderby` does not accept joined props, and the output does not sort usefully.
  sortable: !prop.includes(".") && !LONG_PROPS.has(prop),
  filter: prop === "status" ? { kind: "enum" as const, options: STATUS_OPTIONS } : undefined,
  render: (row: ActionRow, locale: string) => {
    const value = row[prop];
    if (prop === "status") return <StatusBadge state={statusState(row)} label={row.status} />;
    if (prop === "command") return <code className="text-data">{value}</code>;
    if (prop === "nodes.nodename")
      return (
        <CrossLink kind="node" id={row.node_id}>
          {value}
        </CrossLink>
      );
    if (prop === "services.svcname")
      return (
        <CrossLink kind="service" id={row.svc_id}>
          {value}
        </CrossLink>
      );
    if (prop === "date_queued") return <RelativeTime value={realDate(value)} locale={locale} />;
    if (prop === "date_dequeued") {
      const date = realDate(value);
      return date === undefined ? undefined : <DateTime value={date} locale={locale} />;
    }
    if (LONG_PROPS.has(prop))
      return (
        <span className="line-clamp-1">{typeof value === "string" ? stripAnsi(value) : value}</span>
      );
    return value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/** Columns shown, plus what the badges and the state need. */
function queryProps(cols: string[] | undefined): string {
  const shown = visibleProps(cols, DEFAULT_COLS, ALL_PROPS);
  return [...new Set(["id", "status", "ret", "node_id", "svc_id", ...shown])].join(",");
}

/**
 * One page of the list, read with the sort, the filters and the columns of `search`.
 * The view reads the page on display with it, and the export every page in turn.
 */
async function fetchActions(search: ResolvedListSearch) {
  // One row more than the page: apicollector does not return the total of a selection.
  const { data, error } = await api.GET("/actions", {
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
  const all = toActionRows(data.data);
  return toPage(all, data.meta, search.limit);
}

function useActions(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "actions",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchActions(search),
  });
}

export function ActionsPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("actions");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/actions" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/actions" });
  const { data, isPending: loading, isError, error, isFetching } = useActions(search);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // An action is named by its command in the messages; by its id otherwise.
  const commands = Object.fromEntries((data?.rows ?? []).map((row) => [row.id, row.command]));

  async function allIds(): Promise<string[]> {
    const { data: page, error: failure } = await api.GET("/actions", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (failure !== undefined) throw new Error(problemText(failure));
    return toActionRows(page.data).map((row) => row.id);
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

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="log" className="h-5 w-5" />
          {t("actions.title")}
        </h1>
        <ActionQueueMenu actions={selectedIds.map((id) => ({ id, name: commands[id] ?? id }))} />
      </div>

      <CollectorList
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => row.id}
        search={search}
        onChange={update}
        isPending={loading}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchActions({ ...search, ...page })}
        total={data?.total}
        onSelectionChange={setSelectedIds}
        selectAllMatching={allIds}
        filterable
      />

      <ActionDetailPanel
        actionId={search.sel}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
