import { createContext } from "react";
import type { ObjectRef } from "./model";
import type { HistoryObject } from "./use-compliance-history";

/** What the editor shows: a ruleset or a moduleset of the draft, or a filterset or a group, read only. */
export type Selection = ObjectRef | { kind: "filterset" | "group"; id: number };

/** Selecting an object shows it in the editor; shared by every link to an object. */
export const SelectContext = createContext<(selection: Selection) => void>(() => undefined);

/** Opens the compliance history: of one object, or of everything with null. */
export const OpenHistoryContext = createContext<(object: HistoryObject | null) => void>(
  () => undefined,
);

/** A secondary button of the designer. */
export const BUTTON =
  "inline-flex h-7 items-center gap-1 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-40";

/**
 * The classes of a drop target, from its state during a drag: dashed where an item
 * may land, solid under the pointer, red under the pointer when it would be refused.
 */
export function dropClasses(target: {
  candidate: boolean;
  accepts: boolean;
  over: boolean;
}): string {
  if (!target.candidate) return "";
  if (!target.accepts) return target.over ? "outline-2 outline-dashed outline-state-down" : "";
  return target.over
    ? "outline-2 outline-accent bg-accent-soft"
    : "outline-2 outline-dashed outline-accent";
}
