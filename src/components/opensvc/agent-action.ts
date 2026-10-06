import type { components } from "@/lib/api/schema";
import type { ObjectState } from "./StatusBadge";

/** An action an agent ran on a service, or a log line of one (svcactions). */
export type AgentAction = components["schemas"]["ServiceActionRow"];

/**
 * The state of an agent action from its status: ok, warn, err as the agent ends
 * it, and an empty status while it runs (or when its end was never reported).
 */
export function actionState(status: string | null | undefined): {
  state: ObjectState;
  labelKey: string;
} {
  switch (status) {
    case "ok":
      return { state: "up", labelKey: "agentActions.statusNames.ok" };
    case "warn":
      return { state: "warn", labelKey: "agentActions.statusNames.warn" };
    case "err":
      return { state: "down", labelKey: "agentActions.statusNames.err" };
    default:
      return { state: "unknown", labelKey: "agentActions.statusNames.running" };
  }
}

/** Resource ids named in full; past them, counted, the whole list in a tooltip. */
export const TARGETS_SHOWN = 2;

/** What an action was limited to: its subset, then its resources. */
export function actionTargets(subset: string | null | undefined, rid: string | null | undefined) {
  const rids = (rid ?? "").split(",").filter((item) => item !== "");
  return [...(subset === null || subset === undefined || subset === "" ? [] : [subset]), ...rids];
}
