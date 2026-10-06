import type { AgentAction } from "@/components/opensvc/agent-action";

/** "restart on dev2n1 · dev/svc/oc3": what ran, where, on what. */
export function actionName(action: AgentAction): string {
  const node = action["nodes.nodename"] ?? action.node_id ?? "";
  const svc = action["services.svcname"] ?? action.svc_id ?? "";
  return [action.action ?? "", node === "" ? "" : `@ ${node}`, svc === "" ? "" : `· ${svc}`]
    .filter((part) => part !== "")
    .join(" ");
}
