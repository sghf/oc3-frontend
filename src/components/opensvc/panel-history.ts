import { useNow } from "@/lib/use-now";
import type { PeekStep } from "@/lib/peek-trail";
import { useRecordHistory } from "@/lib/record-history";
import type { ObjectKind } from "./ObjectIcon";
import { isPeekStep } from "./panel-trail";
import { useObjectLabels } from "./object-label";
import { usePeek } from "./use-peek";

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
  "network",
  "disk",
  "app",
  "tag",
  "moduleset",
  "ruleset",
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
 * The record last picked in the history itself. The panel title, which records
 * every record shown, leaves that one where it stands (`openedFromHistory`): the
 * list must not move under the pointer of who is going through it.
 */
let picked: { key: string; at: number } | null = null;

/** Long enough for the panel to mount and record, too short for another gesture. */
const PICK_MS = 2000;

export function openedFromHistory(key: string): boolean {
  return picked !== null && picked.key === key && performance.now() - picked.at < PICK_MS;
}

/** An entry of the history, as the side panel and the menu show it. */
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
 * only the groups that hold a record — and what opens one, removes one or clears
 * them all. Opening one from here leaves it where it stands.
 */
export function usePanelHistory(currentKey: string, grouping: "time" | "kind" = "time") {
  const history = useRecordHistory();
  const peek = usePeek();
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
    open: (entry: HistoryEntry) => {
      picked = { key: entry.key, at: performance.now() };
      peek(entry.step.kind, entry.step.id);
    },
    remove: (entry: HistoryEntry) => {
      history.remove(entry.step.kind, entry.step.id);
    },
    clear: history.clear,
  };
}
