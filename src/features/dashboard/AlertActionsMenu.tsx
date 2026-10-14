import { useQueryClient } from "@tanstack/react-query";
import {
  ActionsMenu,
  type ActionTarget,
  type DataActionEntry,
} from "@/components/opensvc/ActionsMenu";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/**
 * Actions on dashboard alerts. The agents do not act on alerts: only data
 * actions, in their submenu as in the historical collector (`data_action_del_alerts`).
 *
 * Deleting removes the entry from the collector (`DELETE /alerts/{id}`), which
 * requires the AlertsManager privilege. The checks that raised it raise it again
 * at their next run if the cause remains.
 */
export function AlertActionsMenu({
  alerts,
  onDeleted,
}: {
  alerts: ActionTarget[];
  onDeleted?: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const dataActions: DataActionEntry[] = [
    {
      key: "delete",
      privileges: ["AlertsManager"],
      run: async (target) => {
        const { error } = await api.DELETE("/alerts/{id}", {
          params: { path: { id: target.id } },
        });
        return error === undefined ? null : problemText(error);
      },
      onDone: (done) => {
        if (done.length === 0) return;
        void queryClient.invalidateQueries({ queryKey: ["alerts"] });
        // The Alerts tabs of the node and service panels list them too.
        void queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[2] === "alerts",
        });
        onDeleted?.(done.map((target) => target.id));
      },
    },
  ];
  return <ActionsMenu targets={alerts} dataActions={dataActions} prefix="dashboard.actions" />;
}
