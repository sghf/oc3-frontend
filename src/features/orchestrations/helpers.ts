import type { OrchestrationStep, RunTargetStatus, TargetKind } from "./api";

/** A step with nothing chosen yet, its kind taken from the step before. */
export function emptyStep(kind: TargetKind = "service"): OrchestrationStep {
  return { name: "", action: "", kind, pace: "all", targets: { mode: "pick", ids: [] } };
}

/** Seconds from start to end, or to now while it runs. */
export function elapsed(
  start: string | null | undefined,
  end: string | null | undefined,
): number | undefined {
  if (start === null || start === undefined) return undefined;
  const from = Date.parse(start);
  const to = end === null || end === undefined ? Date.now() : Date.parse(end);
  return Number.isNaN(from) || Number.isNaN(to)
    ? undefined
    : Math.max(0, Math.round((to - from) / 1000));
}

/** The order the counts of a step are told in, what went wrong first. */
export const COUNT_ORDER: readonly RunTargetStatus[] = [
  "failed",
  "refused",
  "timed_out",
  "cancelled",
  "running",
  "queued",
  "ok",
  "waiting",
  "not_run",
];
