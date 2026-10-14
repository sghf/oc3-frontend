import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import type { components } from "@/lib/api/schema";

/**
 * The menu entries a group hides, by key: read by the Menu tab of its panel, the
 * tab's counter and the summary of its properties, under one cache key.
 */
export function useGroupHiddenEntries(groupId: string | undefined) {
  return useQuery({
    queryKey: ["group", groupId ?? "", "hiddenMenuEntries"],
    enabled: groupId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/groups/{group_id}/hidden_menu_entries", {
        params: { path: { group_id: groupId ?? "" }, query: { props: "menu_entry", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? (data.data as { menu_entry?: string }[]) : [];
      return new Set(rows.flatMap((row) => (row.menu_entry === undefined ? [] : [row.menu_entry])));
    },
  });
}

type GroupRow = components["schemas"]["GroupRow"];

/** A group, as its panel and its Menu tab read it. */
export function useGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: ["group", groupId],
    enabled: groupId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/groups/{group_id}", {
        params: { path: { group_id: groupId ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: GroupRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });
}
