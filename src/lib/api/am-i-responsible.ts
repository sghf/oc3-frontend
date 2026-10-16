import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { problemText } from "./problem";

/**
 * Whether the user is responsible for a node or a service, one query for every
 * part of the views asking it (tags, compliance, the service's own properties):
 * 200 when responsible, 403 otherwise.
 *
 * Kept ten minutes, and refreshed live only by the tables responsibility follows,
 * not by the status of the object: the panel of a service would otherwise ask it
 * again at every instance status an agent sends.
 */
export function useAmIResponsible(
  kind: "node" | "service",
  id: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: [kind, id, "am_i_responsible"],
    enabled: enabled && id !== undefined,
    staleTime: 10 * 60 * 1000,
    meta: { liveTables: ["apps", "apps_responsibles", "auth_membership", "auth_group"] },
    queryFn: async ({ signal }) => {
      const { error, response } =
        kind === "node"
          ? await api.GET("/nodes/{node_id}/am_i_responsible", {
              params: { path: { node_id: id ?? "" } },
              signal,
            })
          : await api.GET("/services/{svc_id}/am_i_responsible", {
              params: { path: { svc_id: id ?? "" } },
              signal,
            });
      if (response.status === 403) return false;
      if (error !== undefined) throw new Error(problemText(error));
      return true;
    },
  });
}
