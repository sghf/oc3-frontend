import { createElement } from "react";
import type { ColumnFilterOption } from "@/components/opensvc/CollectorList";
import type { RunStatus } from "./api";
import { RunStatusPill } from "./RunStatusPill";

export const RUN_STATUSES: readonly RunStatus[] = ["running", "succeeded", "failed", "stopped"];

/** Whether a value read from a list is the status of a run. */
export function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === "string" && (RUN_STATUSES as readonly string[]).includes(value);
}

/** The statuses of a run, as a list filter offers them, each as its pill. */
export const RUN_STATUS_OPTIONS: ColumnFilterOption[] = RUN_STATUSES.map((status) => ({
  value: status,
  labelKey: `orchestrations.status.${status}`,
  render: createElement(RunStatusPill, { status }),
}));
