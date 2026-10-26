import { useSyncExternalStore } from "react";
import { useEffectiveUser } from "@/lib/api/impersonation";
import type { ColumnFilters } from "./column-filters";

/**
 * The settings of the lists changed in this browser tab — columns, sort, filters,
 * page size — kept for the lifetime of the tab: two tabs open on the same list may
 * each show it their way, and a change in one does not reach the other. The
 * account's defaults (`user_prefs`, `src/lib/user-prefs.ts`) only change when the
 * user saves a tab's settings as their default.
 *
 * A setting changed in the tab overrides the default; one left alone follows it.
 * null says the setting was changed back to the built-in default, which then
 * overrides the account's.
 *
 * The storage names the user it belongs to, as the panel history does: someone
 * else signing in, or impersonated, in the same tab starts from their defaults.
 */
export interface TabViewPrefs {
  cols?: string[] | null;
  sort?: string[] | null;
  filters?: ColumnFilters | null;
  limit?: number | null;
}

const STORAGE_KEY = "oc3.viewPrefs";

interface Stored {
  user: string;
  views: Record<string, TabViewPrefs | undefined>;
}

const EMPTY: Stored = { user: "", views: {} };

function read(): Stored {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return EMPTY;
    const { user, views } = raw as Record<string, unknown>;
    if (typeof user !== "string" || typeof views !== "object" || views === null) return EMPTY;
    return { user, views: views as Stored["views"] };
  } catch {
    // Storage refused or unreadable: the tab starts from the defaults.
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
    // Not kept: the settings still hold until the page is reloaded.
  }
}

/**
 * The settings of a list changed in this tab by the signed-in user, undefined
 * when none was, and what changes them or forgets them.
 */
export function useTabViewPrefs(view: string) {
  const user = useEffectiveUser() ?? "";
  const snapshot = useSyncExternalStore(subscribe, () => stored);
  const entry = snapshot.user === user ? snapshot.views[view] : undefined;
  return {
    entry,
    /** Records the settings changed, the others left as they are. */
    set: (patch: TabViewPrefs) => {
      const views = stored.user === user ? stored.views : {};
      write({ user, views: { ...views, [view]: { ...views[view], ...patch } } });
    },
    /** Forgets the settings of the list in this tab: it follows the defaults again. */
    clear: () => {
      if (stored.user !== user || stored.views[view] === undefined) return;
      const views = { ...stored.views };
      delete views[view];
      write({ user, views });
    },
  };
}
