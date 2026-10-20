import { useQueryClient } from "@tanstack/react-query";
import {
  ActionsMenu,
  type ActionTarget,
  type DataActionEntry,
} from "@/components/opensvc/ActionsMenu";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

/**
 * Acknowledging failed actions of the agents, the historical "Data actions › On
 * service actions › Acknowledge" (`data_action_ack_actions`): the failure needs
 * nothing more, for the reason given in the comment, common to all. The API
 * requires the responsibility of each service, skips an action not failed or
 * already acknowledged, and recounts the unacknowledged errors of the instance,
 * which its "action errors" alert follows.
 */
export function ActionAckMenu({ actions }: { actions: ActionTarget[] }) {
  const queryClient = useQueryClient();
  const entry: DataActionEntry = {
    key: "acknowledge",
    privileges: [],
    tone: "change",
    comment: true,
    run: async (target, _choice, _values, comment) => {
      const { data, error } = await api.POST("/services_actions/{action_id}", {
        params: { path: { action_id: Number(target.id) } },
        body: { ack: 1, acked_comment: comment },
      });
      if (error !== undefined) return problemText(error);
      // Skipped by the API, its answer saying why: not failed, or acknowledged
      // already. Reported with the refusals, as nothing changed.
      return data.info?.startsWith("skip") === true ? data.info : null;
    },
    onDone: (done) => {
      if (done.length === 0) return;
      void queryClient.invalidateQueries({ queryKey: ["serviceActions"] });
      void queryClient.invalidateQueries({ queryKey: ["agentAction"] });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      // The Actions tabs of the service and instance panels, and their counts.
      void queryClient.invalidateQueries({ queryKey: ["service"] });
      void queryClient.invalidateQueries({ queryKey: ["node"] });
      void queryClient.invalidateQueries({ queryKey: ["instance"] });
      void queryClient.invalidateQueries({ queryKey: ["instances"] });
    },
  };
  return <ActionsMenu targets={actions} dataActions={[entry]} prefix="serviceActions.actions" />;
}
