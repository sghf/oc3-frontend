import type { components } from "@/lib/api/schema";
import { ActionsMenu, type ActionEntry } from "@/components/opensvc/ActionsMenu";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

type ResourceRow = components["schemas"]["ResourceRow"];

/**
 * Agent actions of resources, the resource entries of the historical collector
 * (`on_resources`), in the submenus of the instance menu for the same actions:
 * maintenance, enable then, apart, disable; then start and stop, the start, then
 * apart the restart and the stop, as the instance menu orders them.
 */
const RESOURCE_ACTIONS: readonly ActionEntry[] = [
  { action: "enable", group: "maintenance" },
  { action: "disable", group: "maintenance", separatorBefore: true },
  { action: "start", group: "startStop", separatorBefore: true },
  { action: "restart", group: "startStop", separatorBefore: true },
  { action: "stop", group: "startStop" },
];

/** The resources of one instance, acted on by one agent run. */
interface InstanceResources {
  svcId: string;
  nodeId: string;
  vmname: string;
  rids: string[];
  name: string;
}

/**
 * The resources gathered by instance: the agent acts on several resources of an
 * instance in one run (`--rid a,b`), and two runs on the same service would
 * contend for its lock. The historical collector merges them likewise
 * (`factorize_actions()`).
 */
function byInstance(resources: readonly ResourceRow[]): Map<string, InstanceResources> {
  const out = new Map<string, InstanceResources>();
  for (const row of resources) {
    if (row.svc_id === undefined || row.node_id === undefined || row.rid === undefined) continue;
    const vmname = row.vmname ?? "";
    const key = `${row.svc_id}@${row.node_id}@${vmname}`;
    let entry = out.get(key);
    if (entry === undefined) {
      const service = row["services.svcname"] ?? row.svc_id;
      const node = row["nodes.nodename"] ?? row.node_id;
      entry = {
        svcId: row.svc_id,
        nodeId: row.node_id,
        vmname,
        rids: [],
        name: `${service} @ ${vmname === "" ? node : `${node}/${vmname}`}`,
      };
      out.set(key, entry);
    }
    if (!entry.rids.includes(row.rid)) entry.rids.push(row.rid);
  }
  return out;
}

/**
 * Agent actions of one or several resources, queued through `PUT /actions` with
 * the service, the node, the container of an encapsulated service and the
 * resource ids, as the historical collector does. The API requires the NodeExec
 * privilege and the responsibility for the service; a refusal names the instance.
 */
export function ResourceActionsMenu({
  resources,
}: {
  /** The resources acted on, with their service, node, container and rid. */
  resources: readonly ResourceRow[];
}) {
  const groups = byInstance(resources);
  const targets = [...groups].map(([id, group]) => ({
    id,
    name: `${group.name}: ${group.rids.join(", ")}`,
  }));
  return (
    <ActionsMenu
      targets={targets}
      actions={RESOURCE_ACTIONS}
      prefix="resources.actions"
      queue={async (target, action) => {
        const group = groups.get(target.id);
        if (group === undefined) return "unknown resource";
        const { error } = await api.PUT("/actions", {
          body: {
            svc_id: group.svcId,
            node_id: group.nodeId,
            ...(group.vmname === "" ? {} : { vmname: group.vmname }),
            rid: group.rids.join(","),
            action,
          },
        });
        return error === undefined ? null : problemText(error);
      }}
    />
  );
}
