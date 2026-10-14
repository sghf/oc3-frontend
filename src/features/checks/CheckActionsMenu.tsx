import { useQueryClient } from "@tanstack/react-query";
import {
  ActionsMenu,
  type ActionTarget,
  type DataActionEntry,
} from "@/components/opensvc/ActionsMenu";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import type { components } from "@/lib/api/schema";

type CheckKey = components["schemas"]["CheckKey"];

/**
 * The key of a check, by its id, for the routes of its settings, which name a
 * check by its node, its object, its type and its instance: from the rows on
 * display when known, else read.
 */
async function checkKeyOf(
  id: string,
  known: ReadonlyMap<string, CheckKey>,
): Promise<CheckKey | string> {
  const key = known.get(id);
  if (key !== undefined) return key;
  const { data, error } = await api.GET("/checks/live", {
    params: {
      query: { props: "node_id,svc_id,chk_type,chk_instance", filter: [`id:${id}`], limit: 1 },
    },
  });
  if (error !== undefined) return problemText(error);
  const row = Array.isArray(data.data) ? data.data[0] : undefined;
  if (row?.node_id === undefined || row.chk_type === undefined || row.chk_instance === undefined)
    return "check not found";
  return {
    node_id: row.node_id,
    svc_id: row.svc_id ?? "",
    chk_type: row.chk_type,
    chk_instance: row.chk_instance,
  };
}

/**
 * The data actions of the historical collector on check instances ("Data
 * actions › On check instances"): setting their thresholds, the low one, the high
 * one or both, which then take precedence over the contextual and the default
 * ones; resetting them, which gives the check those again; deleting the check,
 * which the agent reports again at its next run if it still exists. All require
 * CheckExec, and the API the responsibility of each node. The thresholds apply at
 * once, with the alerts of the node.
 *
 * `keys` holds the keys of the checks on display; the others are read.
 */
export function CheckActionsMenu({
  checks,
  keys,
  onDeleted,
}: {
  checks: ActionTarget[];
  keys: ReadonlyMap<string, CheckKey>;
  onDeleted?: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
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
      run: async (target, _choice, values) => {
        const key = await checkKeyOf(target.id, keys);
        if (typeof key === "string") return key;
        const { error } = await api.POST("/checks/settings", {
          body: { ...key, chk_low: values.chk_low, chk_high: values.chk_high },
        });
        return error === undefined ? null : problemText(error);
      },
      onDone: refresh,
    },
    {
      key: "resetThresholds",
      privileges: ["CheckExec"],
      tone: "change",
      run: async (target) => {
        const key = await checkKeyOf(target.id, keys);
        if (typeof key === "string") return key;
        const { error } = await api.DELETE("/checks/settings", { body: key });
        return error === undefined ? null : problemText(error);
      },
      onDone: refresh,
    },
    {
      key: "delete",
      privileges: ["CheckExec"],
      separatorBefore: true,
      run: async (target) => {
        const { error } = await api.DELETE("/checks/live/{id}", {
          params: { path: { id: Number(target.id) } },
        });
        return error === undefined ? null : problemText(error);
      },
      onDone: (done) => {
        refresh(done);
        if (done.length > 0) onDeleted?.(done.map((target) => target.id));
      },
    },
  ];
  return <ActionsMenu targets={checks} dataActions={dataActions} prefix="checks.actions" />;
}
