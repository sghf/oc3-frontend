import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { problemText } from "./problem";
import { useImpersonation } from "./impersonation";

/**
 * The menu entries hidden to the user the requests are made as, by their key
 * (`NavEntry.menuId`): those every organizational group of the user hides, as
 * oc3 resolves them like the historical collector. The cache key follows the
 * impersonation, as the privileges' (`useEffectivePrivileges`), and a change of
 * the groups or of their hidden entries reads them again (`lib/realtime.ts`).
 */
export function useHiddenMenuEntries() {
  const actingAs = useImpersonation()?.userId ?? null;
  return useQuery({
    queryKey: ["user", "self", "hiddenMenuEntries", actingAs],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET("/users/{user_id}/hidden_menu_entries", {
        params: { path: { user_id: "self" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return new Set(data.data);
    },
  });
}
