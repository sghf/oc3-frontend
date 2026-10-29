import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toPage } from "@/lib/api/page";
import { filterQuery, filtersKey, type ColumnFilters } from "@/lib/column-filters";
import type { ResolvedListSearch } from "@/lib/list-search";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";

export type SaveRow = components["schemas"]["SaveRow"];
export type SavesSummary = components["schemas"]["SavesSummaryResponse"];

/** Every prop of a backup, in the order of the historical Saves view. */
export const SAVE_PROPS = [
  "id",
  "save_server",
  "save_id",
  "save_app",
  "node_id",
  "nodename",
  "svc_id",
  "svcname",
  "save_name",
  "save_group",
  "save_level",
  "save_size",
  "save_volume",
  "save_date",
  "save_retention",
] as const satisfies readonly (keyof SaveRow)[];

/** What a row needs besides the columns shown: to link its node and service. */
const KEY_PROPS = ["id", "node_id", "svc_id"];

/** One page of the backups, read with the sort, the filters and the columns of `search`. */
export async function fetchSaves(search: ResolvedListSearch, shown: readonly string[]) {
  const { data, error } = await api.GET("/saves", {
    params: {
      query: {
        props: [...new Set([...KEY_PROPS, ...shown])].join(","),
        orderby: search.sort.join(","),
        offset: search.offset,
        // One row more than the page: the total of a selection is not returned.
        limit: search.limit + 1,
        filter: filterQuery(search.filters),
      },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  const rows: SaveRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(rows, data.meta, search.limit);
}

/** The distribution of a column's values over the backups the filters keep. */
export async function saveStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/saves", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

export function useSaves(search: ResolvedListSearch, shown: readonly string[]) {
  return useQuery({
    queryKey: [
      "saves",
      search.sort,
      search.offset,
      search.limit,
      shown,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load.
    placeholderData: keepPreviousData,
    queryFn: () => fetchSaves(search, shown),
  });
}

/** What the backups are summed by: an application, a server, a group, an object. */
export type SaveShareKey = "app" | "server" | "group" | "object";

/**
 * The size and the number of the backups the filters keep, by `by`: the charts
 * of the historical Saves view. Not asked when `by` is undefined.
 */
export function useSavesSummary(by: SaveShareKey | undefined, filters: ColumnFilters) {
  return useQuery({
    queryKey: ["saves", "summary", by, filtersKey(filters)],
    enabled: by !== undefined,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SavesSummary> => {
      const { data, error } = await api.GET("/saves/summary", {
        params: { query: { by: by ?? "app", filter: filterQuery(filters) } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}
