import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import type { components } from "@/lib/api/schema";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";
import { filterQuery, filtersKey, type ColumnFilters } from "@/lib/column-filters";
import type { ResolvedListSearch } from "@/lib/list-search";

export type OrchestrationRow = components["schemas"]["OrchestrationRow"];
export type RunRow = components["schemas"]["OrchestrationRunRow"];

/** Columns of the list, the id always: the rows open by it. */
const withId = (props: string[]) => [...new Set(["id", ...props])].join(",");

/**
 * One page of the orchestrations, read with the sort, the filters and the
 * columns of `search`, `props` being the columns to read.
 */
export async function fetchOrchestrations(search: ResolvedListSearch, props: string[]) {
  // One row more than the page: whether another page follows.
  const { data, error } = await api.GET("/orchestrations", {
    params: {
      query: {
        props: withId(props),
        orderby: search.sort.join(","),
        offset: search.offset,
        limit: search.limit + 1,
        filter: filterQuery(search.filters),
      },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  const rows: OrchestrationRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(rows, data.meta, search.limit);
}

/** One page of the runs, as `fetchOrchestrations` the orchestrations. */
export async function fetchRuns(search: ResolvedListSearch, props: string[]) {
  const { data, error } = await api.GET("/orchestration_runs", {
    params: {
      query: {
        props: withId(props),
        orderby: search.sort.join(","),
        offset: search.offset,
        limit: search.limit + 1,
        filter: filterQuery(search.filters),
      },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  const rows: RunRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(rows, data.meta, search.limit);
}

/** The distribution of a column's values over the orchestrations the filters keep. */
export async function orchestrationStats(
  prop: string,
  filters: ColumnFilters,
): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/orchestrations", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

/** The distribution of a column's values over the runs the filters keep. */
export async function runStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/orchestration_runs", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

const listKey = (search: ResolvedListSearch, props: string[]) => [
  search.sort,
  search.offset,
  search.limit,
  props,
  filtersKey(search.filters),
];

export function useOrchestrationList(search: ResolvedListSearch, props: string[]) {
  return useQuery({
    queryKey: ["orchestrations", "list", ...listKey(search, props)],
    // The rows on display stay while the next ones load: typing a filter must not
    // empty the table under the field.
    placeholderData: keepPreviousData,
    queryFn: () => fetchOrchestrations(search, props),
  });
}

export function useRunList(search: ResolvedListSearch, props: string[]) {
  return useQuery({
    queryKey: ["orchestration-runs", "list", ...listKey(search, props)],
    placeholderData: keepPreviousData,
    queryFn: () => fetchRuns(search, props),
  });
}

/** The last runs of an orchestration, the latest first, for its editor. */
export function useRecentRuns(orchestrationId: number | undefined, limit = 5) {
  return useQuery({
    queryKey: ["orchestration-runs", "recent", orchestrationId, limit],
    enabled: orchestrationId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/orchestration_runs", {
        params: {
          query: {
            props: "id,status,started",
            orderby: "-id",
            limit,
            filter: [`orchestration_id:eq:${String(orchestrationId ?? 0)}`],
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: RunRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}
