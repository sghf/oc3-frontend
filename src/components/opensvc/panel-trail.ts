import type { PeekStep } from "@/lib/peek-trail";
import type { ObjectKind } from "./ObjectIcon";

/** The kinds `PeekPanel` can open: a step of another kind, from a hand-written URL or an old history, is dropped. */
const PEEK_KINDS: ReadonlySet<string> = new Set<ObjectKind>([
  "node",
  "cluster",
  "service",
  "instance",
  "resource",
  "app",
  "group",
  "user",
  "disk",
  "network",
  "tag",
  "filterset",
  "form",
  "metric",
  "chart",
  "report",
  "moduleset",
  "ruleset",
]);

export function isPeekStep(step: PeekStep): step is PeekStep & { kind: ObjectKind } {
  return PEEK_KINDS.has(step.kind);
}
