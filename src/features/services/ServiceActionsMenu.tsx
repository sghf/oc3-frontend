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
 * Agent actions of a whole service, the service entries of the historical collector
 * (`am_svc_agent_leafs`). The API posts them on a node of the service seen alive in
 * the last fifteen minutes, without `--local`: they apply to the service, not to
 * that one instance. Start, stop, switch and giveback, the orchestration one runs
 * most, stay at the top with freeze and thaw; the recovery of a failed action and
 * the inventory pushes go in submenus.
 */
const SERVICE_ACTIONS: readonly ActionEntry[] = [
  { action: "start" },
  { action: "stop" },
  { action: "switch" },
  { action: "giveback" },
  { action: "freeze", separatorBefore: true },
  { action: "thaw" },
  { action: "abort", group: "recovery", separatorBefore: true },
  { action: "clear", group: "recovery" },
  { action: "push config", group: "inventory" },
  { action: "push resinfo", group: "inventory" },
];

/**
 * The agent actions, then the data actions of the historical collector ("Data
 * actions › On services"): for now the deletion of the service from the collector.
 * As there, no privilege group is needed, only the responsibility for the service,
 * which the API checks for each one (a Manager is responsible for them all).
 * `onDeleted` receives the ids of the services deleted.
 */
export function ServiceActionsMenu({
  services,
  onDeleted,
  onCompare,
  confirm,
}: {
  services: ActionTarget[];
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
      privileges: [],
      run: async (target) => {
        // Cascades on the collector side: instances, resources, alerts, tags,
        // compliance attachments and the history of the service go with it.
        const { error } = await api.DELETE("/services/{svc_id}", {
          params: { path: { svc_id: target.id } },
        });
        return error === undefined ? null : problemText(error);
      },
      onDone: (done) => {
        if (done.length === 0) return;
        void queryClient.invalidateQueries({ queryKey: ["services"] });
        void queryClient.invalidateQueries({ queryKey: ["instances"] });
        onDeleted?.(done.map((target) => target.id));
      },
    },
  ];
  return (
    <ActionsMenu
      targets={services}
      actions={SERVICE_ACTIONS}
      dataActions={dataActions}
      onCompare={onCompare}
      confirm={confirm}
      prefix="services.actions"
      queue={async (target, action) => {
        // `svc_id` alone targets the whole service, as in the historical collector.
        const { error } = await api.PUT("/actions", { body: { svc_id: target.id, action } });
        return error === undefined ? null : problemText(error);
      }}
    />
  );
}
