import { useSyncExternalStore } from "react";
import { useEffectiveUser } from "@/lib/api/impersonation";

/**
 * The records last shown in a panel, kept for the lifetime of the browser tab: each
 * tab has its own history, what this window went through, and it is gone with the
 * tab. Not saved with the account: two tabs open on two subjects do not mix their
 * histories, and nothing of it reaches another machine.
 *
 * The storage names the user it belongs to, like the credentials it sits beside:
 * someone else signing in from the same tab starts from an empty history.
 */

/** A record of the history: what was shown, and when it last was. */
export interface HistoryRecord {
  kind: string;
  id: string;
  /** Milliseconds since the epoch. */
  at: number;
}

const STORAGE_KEY = "oc3.history";

/** Records kept; the history zone of the panel scrolls when they do not all fit. */
const HISTORY_SIZE = 30;

/** A record not shown for this long leaves the history. */
const HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** A record shown again this soon keeps its time: nothing worth a write. */
const HISTORY_RETOUCH_MS = 60 * 1000;

interface Stored {
  user: string;
  records: HistoryRecord[];
}

const EMPTY: Stored = { user: "", records: [] };

function read(): Stored {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return EMPTY;
    const { user, records } = raw as Record<string, unknown>;
    if (typeof user !== "string" || !Array.isArray(records)) return EMPTY;
    return {
      user,
      records: records.flatMap((e: unknown): HistoryRecord[] => {
        if (typeof e !== "object" || e === null) return [];
        const { kind, id, at } = e as Record<string, unknown>;
        return typeof kind === "string" && typeof id === "string" && typeof at === "number"
          ? [{ kind, id, at }]
          : [];
      }),
    };
  } catch {
    // Storage refused or unreadable: the history starts empty.
    return EMPTY;
  }
}

let stored = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function write(next: Stored) {
  stored = next;
  for (const listener of listeners) listener();
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Not kept: the history still holds until the page is reloaded.
  }
}

/**
 * The history of a user, the most recently shown first, without the records shown
 * more than a week before `now` nor those beyond `HISTORY_SIZE`.
 */
function current(user: string, now: number): HistoryRecord[] {
  if (stored.user !== user) return [];
  return stored.records
    .filter((record) => now - record.at < HISTORY_MAX_AGE_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, HISTORY_SIZE);
}

/**
 * The records last shown in a panel by the signed-in user in this tab, the most
 * recently shown first, with the time each was shown, and what records one,
 * removes one or clears them. A record leaves when it was not shown for a week, or
 * when `HISTORY_SIZE` more recent ones push it out.
 */
export function useRecordHistory() {
  const user = useEffectiveUser() ?? "";
  useSyncExternalStore(subscribe, () => stored);
  const entries = current(user, Date.now());
  const other = (kind: string, id: string) => (e: HistoryRecord) => e.kind !== kind || e.id !== id;
  return {
    entries,
    /**
     * Notes that a record is shown. It enters the history with the time it is, or,
     * already listed, takes that time and so comes back in front.
     */
    record: (kind: string, id: string) => {
      if (user === "") return;
      const now = Date.now();
      const records = current(user, now);
      const listed = records.find((e) => e.kind === kind && e.id === id);
      if (listed !== undefined && now - listed.at < HISTORY_RETOUCH_MS) return;
      write({
        user,
        records: [{ kind, id, at: now }, ...records.filter(other(kind, id))].slice(0, HISTORY_SIZE),
      });
    },
    remove: (kind: string, id: string) => {
      write({ user, records: current(user, Date.now()).filter(other(kind, id)) });
    },
    clear: () => {
      write({ user, records: [] });
    },
  };
}
