import { useSyncExternalStore } from "react";
import { useNow } from "@/lib/use-now";
import type { PeekStep } from "@/lib/peek-trail";
import { useRecordHistory } from "@/lib/record-history";
import type { ObjectKind } from "./ObjectIcon";
import { isPeekStep } from "./panel-trail";
import { useObjectLabels } from "./object-label";

export const stepKey = (step: PeekStep) => `${step.kind}:${step.id}`;

/** The key of the record a panel shows, as the history names it; empty without an id. */
export function recordKey(kind: string, recordId: string | undefined): string {
  return recordId === undefined || recordId === "" ? "" : stepKey({ kind, id: recordId });
}

/**
 * The sections of the history, by how long ago a record was shown, and the age each
 * ends at. A record older than the last one is no longer in the history.
 */
const SECTIONS = [
  ["now", 5 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
] as const;

export type HistorySection = (typeof SECTIONS)[number][0];

function sectionOf(age: number): HistorySection {
  return SECTIONS.find(([, limit]) => age < limit)?.[0] ?? "week";
}

/**
 * The kinds of record, in the order of the navigation menu: grouped by kind, the
 * history keeps each group where it stands, whatever was shown last.
 */
const KIND_ORDER: readonly ObjectKind[] = [
  "node",
  "cluster",
  "service",
  "instance",
  "resource",
  "network",
  "disk",
  "app",
  "tag",
  "moduleset",
  "ruleset",
  "safe",
  "user",
  "group",
  "filterset",
  "form",
  "metric",
  "chart",
  "report",
];

function kindRank(kind: ObjectKind): number {
  const rank = KIND_ORDER.indexOf(kind);
  return rank === -1 ? KIND_ORDER.length : rank;
}

/** The heading of a kind of record: the name of its list in the menu. */
const KIND_LABEL: Partial<Record<ObjectKind, string>> = {
  node: "nav.nodes",
  cluster: "nav.clusters",
  service: "nav.services",
  instance: "nav.instances",
  resource: "nav.resources",
  network: "nav.networks",
  disk: "nav.disks",
  app: "nav.apps",
  tag: "nav.tags",
  moduleset: "nav.modulesets",
  ruleset: "nav.rulesets",
  safe: "nav.safe",
  user: "nav.users",
  group: "nav.groups",
  filterset: "nav.filtersets",
  form: "nav.forms",
  metric: "nav.metrics",
  chart: "nav.charts",
  report: "nav.reports",
};

/** The name of a kind of record, as its list in the menu has it. */
export function kindLabel(kind: ObjectKind, t: (key: string) => string): string {
  const label = KIND_LABEL[kind];
  return label === undefined ? kind : t(label);
}

/**
 * A group of the history: a time period, or a kind of object, by the grouping
 * chosen. `key` is unique among the groups of either grouping.
 */
export type HistoryGroup =
  | { key: string; by: "time"; section: HistorySection; entries: HistoryEntry[] }
  | { key: string; by: "kind"; kind: ObjectKind; entries: HistoryEntry[] };

/** How often the sections are worked out again while the history is on screen. */
const TICK_MS = 30 * 1000;

/**
 * The record a panel displays, as `recordKey` names it, empty when none is open:
 * the history marks it among the records shown recently.
 */
let shown = "";
const shownListeners = new Set<() => void>();

/** Notes the record a panel displays, or "" when it closes (`PanelTitle`). */
export function setShownRecord(key: string): void {
  if (key === shown) return;
  shown = key;
  for (const listener of shownListeners) listener();
}

/** The record a panel displays, "" when none does. */
export function useShownRecord(): string {
  return useSyncExternalStore(
    (listener) => {
      shownListeners.add(listener);
      return () => shownListeners.delete(listener);
    },
    () => shown,
  );
}

/** An entry of the history, as the search palette proposes it. */
export interface HistoryEntry {
  key: string;
  step: PeekStep & { kind: ObjectKind };
  label: string;
  /** The record the panel displays. */
  current: boolean;
  section: HistorySection;
  /** When the record was last shown, in milliseconds since the epoch. */
  at: number;
}

/**
 * The panel history, ready to be shown: the records displayed in this browser tab
 * during the last week, the most recently shown first, named, grouped by how long ago they were
 * shown or, with `grouping` "kind", by kind of object in the order of the menu —
 * only the groups that hold a record — and what removes one or clears them all.
 * One is opened as any record (`usePeek`), and comes back in front.
 */
export function usePanelHistory(currentKey: string, grouping: "time" | "kind" = "time") {
  const history = useRecordHistory();
  const now = useNow(TICK_MS);
  const records = history.entries.filter((record): record is typeof record & { kind: ObjectKind } =>
    isPeekStep(record),
  );
  const labels = useObjectLabels(records);
  const entries: HistoryEntry[] = records.map((record, index) => ({
    key: stepKey(record),
    step: { kind: record.kind, id: record.id },
    label: labels[index] ?? record.id,
    current: stepKey(record) === currentKey,
    // A clock set back would give a negative age: such a record is of now.
    section: sectionOf(Math.max(0, now - record.at)),
    at: record.at,
  }));
  // The entries keep their order, the most recently shown first, within each group.
  const groups: HistoryGroup[] =
    grouping === "kind"
      ? [...new Set(entries.map((entry) => entry.step.kind))]
          .sort((a, b) => kindRank(a) - kindRank(b))
          .map((kind) => ({
            key: `kind-${kind}`,
            by: "kind" as const,
            kind,
            entries: entries.filter((entry) => entry.step.kind === kind),
          }))
      : SECTIONS.map(([section]) => ({
          key: `time-${section}`,
          by: "time" as const,
          section,
          entries: entries.filter((entry) => entry.section === section),
        })).filter((group) => group.entries.length > 0);
  return {
    entries,
    groups,
    now,
    remove: (entry: HistoryEntry) => {
      history.remove(entry.step.kind, entry.step.id);
    },
    clear: history.clear,
  };
}
