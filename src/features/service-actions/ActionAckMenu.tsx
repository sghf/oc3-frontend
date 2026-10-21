import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ActionsMenu,
  type ActionTarget,
  type DataActionEntry,
} from "@/components/opensvc/ActionsMenu";
import { inBatches } from "@/lib/api/batch";
import { api } from "@/lib/api/client";

/**
 * Acknowledging failed actions of the agents, the historical "Data actions › On
 * service actions › Acknowledge" (`data_action_ack_actions`): the failure needs
 * nothing more, for the reason given in the comment, common to all. The API
 * requires the responsibility of each service, skips an action not failed or
 * already acknowledged, and recounts the unacknowledged errors of the instance,
 * which its "action errors" alert follows.
 */
export function ActionAckMenu({ actions }: { actions: ActionTarget[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // A batch answer as the report wants it: the objects done, and why the others failed.
  const report = (results: { item: ActionTarget; ok: boolean; message: string }[]) => ({
    done: results.flatMap((r) => (r.ok ? [r.item] : [])),
    failures: results.flatMap((r) =>
      r.ok ? [] : [t("serviceActions.actions.failure", { name: r.item.name, message: r.message })],
    ),
  });
  const entry: DataActionEntry = {
    key: "acknowledge",
    privileges: [],
    tone: "change",
    comment: true,
    // By batches, the errors of each instance counted once per batch.
    runAll: async (targets, _choice, _values, comment) => {
      const results = await inBatches(targets, (batch) =>
        api.POST("/services_actions/ack", {
          body: { ids: batch.map((target) => Number(target.id)), acked_comment: comment },
        }),
      );
      // Skipped by the API, its answer saying why: not failed, or acknowledged
      // already. Reported with the refusals, as nothing changed.
      return report(results.map((r) => (r.message.startsWith("skip") ? { ...r, ok: false } : r)));
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
