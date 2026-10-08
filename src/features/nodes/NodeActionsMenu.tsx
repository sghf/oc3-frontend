import { useQueryClient } from "@tanstack/react-query";
import {
  ActionsMenu,
  type ActionEntry,
  type ActionTarget,
  type DataActionEntry,
} from "@/components/opensvc/ActionsMenu";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/**
 * Agent actions of a node, the "node agent" entries of the historical collector
 * (`am_node_agent_leafs`). The most used stay at the top: the node inventory, the
 * checks, the sysreport, freeze and thaw. The others are grouped in submenus by
 * what they act on: the other inventories, compliance, the agent itself, and the
 * actions that stop the node, last and apart. Wake On LAN, which goes through
 * another node, the provisioning from a template and the root password rotation
 * are not offered, as the API does not accept them.
 */
const ACTIONS: readonly ActionEntry[] = [
  { action: "pushasset" },
  { action: "checks" },
  { action: "sysreport" },
  { action: "pushdisks", group: "inventory" },
  { action: "pushpkg", group: "inventory" },
  { action: "pushpatch", group: "inventory" },
  { action: "pushstats", group: "inventory" },
  { action: "scanscsi", group: "inventory" },
  { action: "compliance_check", group: "compliance" },
  { action: "compliance_fix", group: "compliance" },
  { action: "updatecomp", group: "compliance" },
  { action: "updatepkg", group: "agent" },
  { action: "freeze", separatorBefore: true },
  { action: "thaw" },
  { action: "reboot", group: "power", separatorBefore: true },
  { action: "schedule_reboot", group: "power" },
  { action: "unschedule_reboot", group: "power" },
  { action: "drain", group: "power" },
  { action: "shutdown", group: "power" },
];

/**
 * The agent actions, then the data actions of the historical collector ("Data
 * actions › On nodes"): for now the deletion of the node from the collector, offered
 * to NodeManager as the API requires, which also checks the responsibility for each
 * node. `onDeleted` receives the ids of the nodes deleted.
 */
export function NodeActionsMenu({
  nodes,
  onDeleted,
  onCompare,
  confirm,
}: {
  nodes: ActionTarget[];
  /** Opens the comparison of the selection, see ActionsMenu. */
  onCompare?: () => void;
  /** Where the confirmation shows, see ActionsMenu: "popover" in a panel header. */
  confirm?: "inline" | "popover";
  onDeleted?: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const dataActions: DataActionEntry[] = [
    {
      key: "delete",
      privileges: ["NodeManager"],
      run: async (target) => {
        // Cascades on the collector side: instances, alerts, checks, packages, tags
        // and the other records of the node go with it.
        const { error } = await api.DELETE("/nodes/{node_id}", {
          params: { path: { node_id: target.id } },
        });
        return error === undefined ? null : problemText(error);
      },
      onDone: (done) => {
        if (done.length === 0) return;
        void queryClient.invalidateQueries({ queryKey: ["nodes"] });
        onDeleted?.(done.map((target) => target.id));
      },
    },
  ];
  return (
    <ActionsMenu
      targets={nodes}
      actions={ACTIONS}
      dataActions={dataActions}
      onCompare={onCompare}
      confirm={confirm}
      prefix="nodes.actions"
      queue={async (target, action) => {
        // `node_id` alone targets the node, as in the historical collector.
        const { error } = await api.PUT("/actions", { body: { node_id: target.id, action } });
        return error === undefined ? null : problemText(error);
      }}
    />
  );
}
