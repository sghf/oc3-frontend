import { useQueryClient } from "@tanstack/react-query";
import {
  ActionsMenu,
  type ActionEntry,
  type ActionTarget,
  type DataActionEntry,
} from "@/components/opensvc/ActionsMenu";
import { objectDataActions } from "@/components/opensvc/object-data-actions";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/**
 * Agent actions of a whole service, the service entries of the historical collector
 * (`am_svc_agent_leafs`). The API posts them on a node of the service seen alive in
 * the last fifteen minutes, without `--local`: they apply to the service, not to
 * that one instance. As on the node, one submenu per kind of effect, from the
 * harmless to the disruptive: what refreshes the collector's data; orchestration,
 * freezing it then clearing or aborting what it runs; placement; then, apart, the
 * start and the stop. Within a submenu the reversible entries come first.
 */
const SERVICE_ACTIONS: readonly ActionEntry[] = [
  { action: "push config", group: "refresh" },
  { action: "push resinfo", group: "refresh" },
  { action: "freeze", group: "orchestration" },
  { action: "thaw", group: "orchestration" },
  { action: "clear", group: "orchestration", separatorBefore: true },
  { action: "abort", group: "orchestration" },
  { action: "switch", group: "placement" },
  { action: "giveback", group: "placement" },
  { action: "start", group: "startStop", separatorBefore: true },
  { action: "stop", group: "startStop", separatorBefore: true },
];

/**
 * The agent actions, then the data actions of the historical collector ("Data
 * actions › On services"): notifications, tags and compliance attachments (see
 * objectDataActions), then, last, the deletion of the service from the collector.
 * As there, the deletion needs no privilege group, only the responsibility for the
 * service, which the API checks for each one (a Manager is responsible for them
 * all). `onDeleted` receives the ids of the services deleted.
 */
export function ServiceActionsMenu({
  services,
  onDeleted,
  onCompare,
}: {
  services: ActionTarget[];
  /** Opens the comparison of the selection, see ActionsMenu. */
  onCompare?: () => void;
  onDeleted?: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const dataActions: DataActionEntry[] = [
    ...objectDataActions("service", queryClient),
    {
      key: "delete",
      separatorBefore: true,
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
      prefix="services.actions"
      // `svc_id` alone targets the whole service, as in the historical collector.
      enqueue={(target, action) => ({ svc_id: target.id, action })}
    />
  );
}
