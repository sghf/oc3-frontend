import type { Operation } from "./model";

/**
 * The pending changes of the designer sandbox, kept in the browser between
 * visits: leaving the page, reloading it or closing the browser loses nothing
 * until the changes are committed or discarded.
 *
 * What is kept is the list of operations, not the draft they produced: the
 * designer replays them on the collector's data as found on return, so that the
 * changes made meanwhile by others are kept, and an operation the new data no
 * longer allows is reported instead of committed blindly.
 *
 * The storage is per user, as the effective user of the requests (an
 * impersonated user has drafts of their own), and per browser, shared by its
 * tabs: a tab is told when another one changes the draft (`watchSavedDraft`).
 */
export interface SavedEntry {
  operation: Operation;
  /** When the operation was made, "YYYY-MM-DD HH:MM:SS", stamped again on replay. */
  at: string;
  author: string;
}

export interface SavedDraft {
  entries: SavedEntry[];
  /** The version of the compliance history the changes restore, if they do. */
  restoredFrom?: string;
}

const STORAGE_PREFIX = "oc3.designerDraft:";
const FORMAT = 1;

function storageKey(user: string): string {
  return STORAGE_PREFIX + user;
}

function isEntry(value: unknown): value is SavedEntry {
  if (typeof value !== "object" || value === null) return false;
  const { operation, at, author } = value as Record<string, unknown>;
  return (
    typeof operation === "object" &&
    operation !== null &&
    typeof (operation as Record<string, unknown>).op === "string" &&
    typeof at === "string" &&
    typeof author === "string"
  );
}

function parse(raw: string | null): SavedDraft | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { format, entries, restoredFrom } = value as Record<string, unknown>;
    if (format !== FORMAT || !Array.isArray(entries)) return null;
    // An entry of another shape is dropped here; one of the right shape the draft
    // no longer allows is refused on replay, and reported.
    return {
      entries: entries.filter(isEntry),
      restoredFrom: typeof restoredFrom === "string" ? restoredFrom : undefined,
    };
  } catch {
    return null;
  }
}

/** The changes kept for the user, null when there are none. */
export function readSavedDraft(user: string): SavedDraft | null {
  try {
    return parse(localStorage.getItem(storageKey(user)));
  } catch {
    // Storage refused: the sandbox starts empty.
    return null;
  }
}

function serialize(draft: SavedDraft | null): string | null {
  if (draft === null || draft.entries.length === 0) return null;
  return JSON.stringify({
    format: FORMAT,
    entries: draft.entries,
    restoredFrom: draft.restoredFrom,
  });
}

/** Whether the changes kept for the user are these, as another tab may have changed them. */
export function isSavedDraft(user: string, draft: SavedDraft | null): boolean {
  try {
    return localStorage.getItem(storageKey(user)) === serialize(draft);
  } catch {
    return true;
  }
}

/** Keeps the changes of the user, or forgets them with null or no entry. */
export function writeSavedDraft(user: string, draft: SavedDraft | null): void {
  const text = serialize(draft);
  try {
    // Written only when it changes: the other tabs hear of each write.
    if (localStorage.getItem(storageKey(user)) === text) return;
    if (text === null) localStorage.removeItem(storageKey(user));
    else localStorage.setItem(storageKey(user), text);
  } catch {
    // Not kept (storage refused or full): the changes still hold in the page.
  }
}

/**
 * Calls back when another tab of the browser changes or forgets the changes kept
 * for the user. The storage event never fires in the tab that wrote.
 */
export function watchSavedDraft(user: string, onChange: () => void): () => void {
  const key = storageKey(user);
  const listener = (event: StorageEvent) => {
    if (event.key === key || event.key === null) onChange();
  };
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("storage", listener);
  };
}
