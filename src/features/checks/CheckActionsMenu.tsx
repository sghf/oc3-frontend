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
 * The data actions of the historical collector on check instances ("Data
 * actions › On check instances"): setting their thresholds, the low one, the high
 * one or both, which then take precedence over the contextual and the default
 * ones; resetting them, which gives the check those again; deleting the check,
 * which the agent reports again at its next run if it still exists. All require
 * CheckExec, and the API the responsibility of each node. The thresholds apply at
 * once, with the alerts of the node. Sent by batches, the checks of each node
 * refreshed once per batch (`POST /checks/live/batch`).
 */
export function CheckActionsMenu({
  checks,
  onDeleted,
}: {
  checks: ActionTarget[];
  onDeleted?: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // A batch answer as the report wants it: the objects done, and why the others failed.
  const report = (results: { item: ActionTarget; ok: boolean; message: string }[]) => ({
    done: results.flatMap((r) => (r.ok ? [r.item] : [])),
    failures: results.flatMap((r) =>
      r.ok ? [] : [t("checks.actions.failure", { name: r.item.name, message: r.message })],
    ),
  });
  const refresh = (done: ActionTarget[]) => {
    if (done.length === 0) return;
    void queryClient.invalidateQueries({ queryKey: ["checks"] });
    void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    // The Checks tab of the node panels.
    void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[2] === "checks" });
  };
  const dataActions: DataActionEntry[] = [
    {
      key: "setThresholds",
      privileges: ["CheckExec"],
      tone: "change",
      fields: ["chk_low", "chk_high"],
      runAll: async (targets, _choice, values) =>
        report(
          await inBatches(targets, (batch) =>
            api.POST("/checks/live/batch", {
              body: {
                action: "set_thresholds",
                ids: batch.map((target) => Number(target.id)),
                chk_low: values.chk_low,
                chk_high: values.chk_high,
              },
            }),
          ),
        ),
      onDone: refresh,
    },
    {
      key: "resetThresholds",
      privileges: ["CheckExec"],
      tone: "change",
      runAll: async (targets) =>
        report(
          await inBatches(targets, (batch) =>
            api.POST("/checks/live/batch", {
              body: { action: "reset_thresholds", ids: batch.map((target) => Number(target.id)) },
            }),
          ),
        ),
      onDone: refresh,
    },
    {
      key: "delete",
      privileges: ["CheckExec"],
      separatorBefore: true,
      runAll: async (targets) =>
        report(
          await inBatches(targets, (batch) =>
            api.POST("/checks/live/batch", {
              body: { action: "delete", ids: batch.map((target) => Number(target.id)) },
            }),
          ),
        ),
      onDone: (done) => {
        refresh(done);
        if (done.length > 0) onDeleted?.(done.map((target) => target.id));
      },
    },
  ];
  return <ActionsMenu targets={checks} dataActions={dataActions} prefix="checks.actions" />;
}
