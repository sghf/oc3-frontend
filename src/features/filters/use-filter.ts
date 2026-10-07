import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

type FilterRow = components["schemas"]["FilterRow"];

/** Loads a filter; shared with the edit form, which starts from it. */
export function useFilter(filterId: string | undefined) {
  return useQuery({
    queryKey: ["filter", filterId],
    enabled: filterId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/filters/{filter_id}", {
        params: { path: { filter_id: filterId ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: FilterRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });
}

/** The filtersets holding a filter, which lose it when the filter is deleted. */
export function useFilterUsage(filterId: string | undefined) {
  return useQuery({
    queryKey: ["filter", filterId, "usage"],
    enabled: filterId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/filters/{filter_id}/usage", {
        params: { path: { filter_id: filterId ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.data.filtersets;
    },
  });
}
