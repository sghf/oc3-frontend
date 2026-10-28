import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toPage } from "@/lib/api/page";
import { filterQuery, filtersKey, type ColumnFilters } from "@/lib/column-filters";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import type { ResolvedListSearch } from "@/lib/list-search";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";

export type QuotaRow = components["schemas"]["QuotaRow"];
export type ArrayRow = components["schemas"]["ArrayRow"];
export type DiskGroupRow = components["schemas"]["DiskGroupRow"];

/** Every prop of a quota row, in the order of the historical quota view. */
export const QUOTA_PROPS = [
  "id",
  "array_name",
  "array_model",
  "dg_name",
  "dg_size",
  "dg_reserved",
  "dg_reservable",
  "dg_used",
  "dg_free",
  "app",
  "quota",
  "quota_used",
  "array_id",
  "dg_id",
  "app_id",
] as const satisfies readonly (keyof QuotaRow)[];

/** What a quota needs besides the columns shown: to name it and act on it. */
const KEY_PROPS = [
  "id",
  "array_id",
  "array_name",
  "dg_id",
  "dg_name",
  "app",
  "quota",
  "quota_used",
];

/** One page of the quotas, read with the sort, the filters and the columns of `search`. */
export async function fetchQuotas(search: ResolvedListSearch, shown: readonly string[]) {
  const { data, error } = await api.GET("/quotas", {
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
  const rows: QuotaRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(rows, data.meta, search.limit);
}

/** The distribution of a column's values over the quotas the filters keep. */
export async function quotaStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/quotas", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

export function useQuotas(search: ResolvedListSearch, shown: readonly string[]) {
  return useQuery({
    queryKey: [
      "quotas",
      search.sort,
      search.offset,
      search.limit,
      shown,
      filtersKey(search.filters),
    ],
    // The rows on display stay while the next ones load.
    placeholderData: keepPreviousData,
    queryFn: () => fetchQuotas(search, shown),
  });
}

/** A quota with every prop, null when it does not exist or is out of reach. */
export function useQuota(id: string | undefined) {
  return useQuery({
    queryKey: ["quotas", "one", id],
    enabled: id !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/quotas", {
        params: {
          query: { props: QUOTA_PROPS.join(","), filter: [`id:eq:${id ?? ""}`], limit: 1 },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: QuotaRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });
}

/** The storage arrays, by name. */
export function useArrays() {
  return useQuery({
    queryKey: ["quotas", "arrays"],
    queryFn: async () => {
      const { data, error } = await api.GET("/arrays", {
        params: { query: { props: "id,array_name,array_model", orderby: "array_name", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: ArrayRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}

/** The disk groups of an array, by name, with their sizes. */
export function useDiskGroups(arrayId: string | undefined) {
  return useQuery({
    queryKey: ["quotas", "diskgroups", arrayId],
    enabled: arrayId !== undefined && arrayId !== "",
    queryFn: async () => {
      const { data, error } = await api.GET("/arrays/{array_id}/diskgroups", {
        params: {
          path: { array_id: arrayId ?? "" },
          query: {
            props: "id,dg_name,dg_size,dg_used,dg_free,dg_reserved",
            orderby: "dg_name",
            limit: 0,
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: DiskGroupRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}

/** Whether the user may add, change and delete quotas: a StorageManager, a Manager. */
export function useCanManageQuotas(): boolean {
  const privileges = useEffectivePrivileges();
  return privileges.data !== undefined && hasPrivilege(privileges.data, ["StorageManager"]);
}

/** Gives an application code a quota in a disk group, or changes the one it has. */
export async function setQuota(arrayId: string, dgId: number, app: string, quota: number) {
  const { data, error } = await api.POST("/arrays/{array_id}/diskgroups/{dg_id}/quotas", {
    params: { path: { array_id: arrayId, dg_id: dgId } },
    body: { app, quota },
  });
  if (error !== undefined) throw new Error(problemText(error));
  return data;
}

/** Changes a quota: its size, or the application code it is for. */
export async function changeQuota(row: QuotaRow, change: { quota?: number; app?: string }) {
  const { data, error } = await api.POST(
    "/arrays/{array_id}/diskgroups/{dg_id}/quotas/{quota_id}",
    {
      params: {
        path: {
          array_id: String(row.array_id ?? ""),
          dg_id: row.dg_id ?? 0,
          quota_id: row.id ?? 0,
        },
      },
      body: change,
    },
  );
  if (error !== undefined) throw new Error(problemText(error));
  return data;
}

/** Deletes a quota. */
export async function deleteQuota(row: QuotaRow) {
  const { data, error } = await api.DELETE(
    "/arrays/{array_id}/diskgroups/{dg_id}/quotas/{quota_id}",
    {
      params: {
        path: {
          array_id: String(row.array_id ?? ""),
          dg_id: row.dg_id ?? 0,
          quota_id: row.id ?? 0,
        },
      },
    },
  );
  if (error !== undefined) throw new Error(problemText(error));
  return data;
}
