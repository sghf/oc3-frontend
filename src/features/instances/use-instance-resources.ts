import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import {
  getServiceInstanceNames,
  namedResources,
  SERVICE_RESOURCE_PROPS,
  type ServiceResource,
} from "@/features/services/related/queries";
import { fromInstanceId } from "./instance-id";

type ResourceRow = components["schemas"]["ResourceRow"];
type InstanceRow = components["schemas"]["InstanceRow"];

/**
 * Resources of an instance: those its node reports for the service, and of an
 * encapsulated service, those of its container only.
 */
export function useInstanceResources(instanceId: string | undefined) {
  const key = instanceId === undefined ? null : fromInstanceId(instanceId);
  return useQuery({
    queryKey: ["instance", instanceId, "resources"],
    enabled: key !== null,
    queryFn: async ({ signal }): Promise<ServiceResource[]> => {
      const svcId = key?.svcId ?? "";
      const [resources, instances] = await Promise.all([
        api.GET("/services/{svc_id}/nodes/{node_id}/resources", {
          signal,
          params: {
            path: { svc_id: svcId, node_id: key?.nodeId ?? "" },
            query: { props: SERVICE_RESOURCE_PROPS, orderby: "rid", limit: 0 },
          },
        }),
        getServiceInstanceNames(svcId, signal),
      ]);
      if (resources.error !== undefined) throw new Error(problemText(resources.error));
      if (instances.error !== undefined) throw new Error(problemText(instances.error));
      const rows = (Array.isArray(resources.data.data) ? resources.data.data : []) as ResourceRow[];
      const vmname = key?.vmname ?? "";
      return namedResources(
        svcId,
        rows.filter((row) => (row.vmname ?? "") === vmname),
        Array.isArray(instances.data.data) ? (instances.data.data as InstanceRow[]) : [],
      );
    },
  });
}
