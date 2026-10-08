import { useQueryClient } from "@tanstack/react-query";
import {
  ActionsMenu,
  type ActionEntry,
  type ActionTarget,
  type DataActionEntry,
} from "@/components/opensvc/ActionsMenu";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { fromInstanceId } from "./instance-id";

/**
 * Agent actions of an instance, the instance entries of the historical collector
 * (`on_services_instances`): start, stop and restart at the top, then placement
 * (switch, takeover, giveback), replication, freeze and thaw, and in submenus the
 * maintenance of the instance, the compliance runs on the modules attached to the
 * service, and the inventory pushes.
 */
const INSTANCE_ACTIONS: readonly ActionEntry[] = [
  { action: "start" },
  { action: "stop" },
  { action: "restart" },
  { action: "switch", group: "placement", separatorBefore: true },
  { action: "takeover", group: "placement" },
  { action: "giveback", group: "placement" },
  { action: "syncall", group: "sync" },
  { action: "syncnodes", group: "sync" },
  { action: "syncdrp", group: "sync" },
  { action: "freeze", separatorBefore: true },
  { action: "thaw" },
  { action: "enable", group: "maintenance", separatorBefore: true },
  { action: "disable", group: "maintenance" },
  { action: "abort", group: "maintenance" },
  { action: "clear", group: "maintenance" },
  { action: "compliance_check", group: "compliance" },
  { action: "compliance_fix", group: "compliance" },
  { action: "push config", group: "inventory" },
  { action: "push resinfo", group: "inventory" },
];

/**
 * Agent actions of an instance: the same as for a service, but posted on its node and
 * limited to that instance (the API adds `--local`). The target is named by the
 * instance id `svc_id@node_id`, followed by `@mon_vmname` for a container of an
 * encapsulated service: the agent acts on the service on the node, so the
 * containers of one node make a single target.
 *
 * Queued through `PUT /actions` with the service and the node, as the historical
 * collector and its REST API do, rather than through an endpoint of their own.
 */
export function InstanceActionsMenu({
  instances,
  onDeleted,
  onCompare,
  confirm,
}: {
  instances: ActionTarget[];
  /** Opens the comparison of the selection, see ActionsMenu. */
  onCompare?: () => void;
  /** Where the confirmation shows, see ActionsMenu: "popover" in a panel header. */
  confirm?: "inline" | "popover";
  /** Ids of the instances deleted, as given in `instances`, containers included. */
  onDeleted?: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const targets = [
    ...new Map(
      instances.map((target) => {
        const key = fromInstanceId(target.id);
        if (key === null) return [target.id, target] as const;
        const id = `${key.svcId}@${key.nodeId}`;
        const suffix = key.vmname === undefined ? "" : ` (${key.vmname})`;
        const name =
          suffix !== "" && target.name.endsWith(suffix)
            ? target.name.slice(0, -suffix.length)
            : target.name;
        return [id, { ...target, id, name }] as const;
      }),
    ).values(),
  ];
  // The data actions of the historical collector ("Data actions › On services
  // instances"): for now the deletion of the instance from the collector, which
  // takes every container of the service on that node, as the API deletes by
  // service and node. No privilege group is needed, only the responsibility for the
  // service, which the API checks.
  const dataActions: DataActionEntry[] = [
    {
      key: "delete",
      privileges: [],
      run: async (target) => {
        const key = fromInstanceId(target.id);
        if (key === null) return "invalid instance id";
        const { error } = await api.DELETE("/services/{svc_id}/instances/{node_id}", {
          params: { path: { svc_id: key.svcId, node_id: key.nodeId } },
        });
        return error === undefined ? null : problemText(error);
      },
      onDone: (done) => {
        if (done.length === 0) return;
        void queryClient.invalidateQueries({ queryKey: ["instances"] });
        void queryClient.invalidateQueries({ queryKey: ["services"] });
        const gone = new Set(done.map((target) => target.id));
        onDeleted?.(
          instances
            .filter((instance) => {
              const key = fromInstanceId(instance.id);
              return key !== null && gone.has(`${key.svcId}@${key.nodeId}`);
            })
            .map((instance) => instance.id),
        );
      },
    },
  ];
  return (
    <ActionsMenu
      targets={targets}
      actions={INSTANCE_ACTIONS}
      dataActions={dataActions}
      onCompare={onCompare}
      confirm={confirm}
      prefix="instances.actions"
      queue={async (target, action) => {
        const key = fromInstanceId(target.id);
        if (key === null) return "invalid instance id";
        const { error } = await api.PUT("/actions", {
          body: { svc_id: key.svcId, node_id: key.nodeId, action },
        });
        return error === undefined ? null : problemText(error);
      }}
    />
  );
}
