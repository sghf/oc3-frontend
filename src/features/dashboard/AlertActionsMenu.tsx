import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
 * Deleting removes the entries from the collector by batches of 5000
 * (`POST /alerts/delete`, one transaction, audit entry and change event each),
 * which requires the AlertsManager privilege. An alert gone meanwhile is named
 * in the report. The checks that raised an alert raise it again at their next
 * run if the cause remains.
 */
/** Alerts deleted per request, under the 10000 the api takes. */
const BATCH = 5000;

export function AlertActionsMenu({
  alerts,
  onDeleted,
}: {
  alerts: ActionTarget[];
  onDeleted?: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const dataActions: DataActionEntry[] = [
    {
      key: "delete",
      privileges: ["AlertsManager"],
      runAll: async (targets) => {
        const done: ActionTarget[] = [];
        const failures: string[] = [];
        for (let start = 0; start < targets.length; start += BATCH) {
          const batch = targets.slice(start, start + BATCH);
          const { data, error } = await api.POST("/alerts/delete", {
            body: { ids: batch.map((target) => Number(target.id)) },
          });
          if (error !== undefined) {
            const message = problemText(error);
            failures.push(
              ...batch.map((target) =>
                t("dashboard.actions.failure", { name: target.name, message }),
              ),
            );
            continue;
          }
          const gone = new Set(data.not_found.map(String));
          for (const target of batch) {
            if (gone.has(target.id))
              failures.push(
                t("dashboard.actions.failure", {
                  name: target.name,
                  message: t("dashboard.actions.notFound"),
                }),
              );
            else done.push(target);
          }
        }
        return { done, failures };
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
