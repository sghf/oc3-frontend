import { ActionsMenu, type ActionEntry, type ActionTarget } from "@/components/opensvc/ActionsMenu";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/**
 * Agent actions of a whole cluster: the three cluster-wide actions of om3 (`om
 * cluster freeze`, `unfreeze` and `abort`). The collector queues them for a live
 * node of the cluster running om3, which runs them on every node (`om node <action>
 * --node *`). Three entries, left without submenu, which would only add a click:
 * freeze and thaw, then, apart, abort, which stops the running orchestration. The other
 * cluster commands of om3 (join, leave, enroll, evict, register, ssh trust) need
 * arguments or a local session and are not offered.
 */
const CLUSTER_ACTIONS: readonly ActionEntry[] = [
  { action: "freeze" },
  { action: "thaw" },
  { action: "abort", separatorBefore: true },
];

export function ClusterActionsMenu({ clusters }: { clusters: ActionTarget[] }) {
  return (
    <ActionsMenu
      targets={clusters}
      actions={CLUSTER_ACTIONS}
      prefix="clusters.actions"
      queue={async (target, action) => {
        // `cluster_id` alone targets the whole cluster.
        const { error } = await api.PUT("/actions", { body: { cluster_id: target.id, action } });
        return error === undefined ? null : problemText(error);
      }}
    />
  );
}
