import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Fits the columns of a table to the width of its container: the first columns
 * are kept, those that do not fit after them hidden, and brought back when the
 * container widens.
 *
 * A column claims its natural width, the widest of its cells unwrapped, but at
 * most `CAP_REM`: a long text wraps within that much rather than pushing the
 * columns after it out. A cell that cannot wrap below its longest word claims
 * that word. The table fits when the claims of its columns add up to the width
 * of the container.
 *
 * The widths are measured on the table itself, before the browser paints: a
 * column added that does not fit is taken out again before anything shows. A
 * count that did not fit is not tried again until the container widens beyond
 * the width it failed at, or the content changes.
 */

const CAP_REM = 15;

const STORAGE_KEY = "oc3.fitColumns";

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    // Storage refused or unreadable: the columns fit.
    return true;
  }
}

let fitting = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether the tables fit their columns to the width, and what changes it. Kept in
 * the browser rather than with the account: it depends on the screen.
 */
export function useFitColumnsEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, () => fitting);
  const set = useCallback((next: boolean) => {
    fitting = next;
    for (const listener of listeners) listener();
    try {
      if (next) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, "off");
    } catch {
      // Not kept: the choice holds until the page is reloaded.
    }
  }, []);
  return [enabled, set];
}

/** Widest a column claims for a text that wraps, in pixels. */
function capPixels(): number {
  return CAP_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
}

/**
 * Width the columns of the first row of the table claim, in pixels: each its
 * natural width, capped at `cap` unless its longest word is wider.
 */
function claimedWidth(table: HTMLTableElement, cap: number): number {
  const cells = Array.from(table.tHead?.rows[0]?.cells ?? []);
  const width = table.style.width;
  table.style.width = "max-content";
  const natural = cells.map((cell) => cell.getBoundingClientRect().width);
  table.style.width = "min-content";
  const narrowest = cells.map((cell) => cell.getBoundingClientRect().width);
  table.style.width = width;
  return natural.reduce(
    (sum, wide, index) => sum + Math.min(wide, Math.max(narrowest[index] ?? wide, cap)),
    0,
  );
}

/**
 * How many of `total` columns the table shows, and the refs to put on the table
 * and its container. `content` stands for what the cells hold, the rows and the
 * columns asked: a new one measures again. Disabled, every column shows, and
 * `wouldHide` tells whether fitting would hide some.
 */
export function useFitColumns(total: number, content: unknown, enabled: boolean) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const table = useRef<HTMLTableElement | null>(null);
  const [width, setWidth] = useState<number>();
  const [count, setCount] = useState(total);
  // The count that last did not fit, the width it failed at and the content.
  const failed = useRef<{ count: number; width: number; content: unknown } | null>(null);
  // The last state found stable: the same one again needs no measure.
  const settled = useRef<{ count: number; width: number; content: unknown } | null>(null);

  useLayoutEffect(() => {
    if (container === null) return;
    setWidth(container.clientWidth);
    const observer = new ResizeObserver(() => {
      setWidth(container.clientWidth);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [container]);

  const shown = enabled ? Math.min(count, total) : total;
  // Fitting off: whether fitting would hide columns, every one showing.
  const [wouldHide, setWouldHide] = useState(false);

  useLayoutEffect(() => {
    if (enabled || table.current === null || width === undefined || width === 0) return;
    setWouldHide(total > 1 && claimedWidth(table.current, capPixels()) > width);
  }, [enabled, width, content, total]);

  useLayoutEffect(() => {
    if (!enabled || table.current === null || width === undefined || width === 0) return;
    const now = settled.current;
    if (now !== null && now.count === shown && now.width === width && now.content === content)
      return;
    if (claimedWidth(table.current, capPixels()) > width && shown > 1) {
      failed.current = { count: shown, width, content };
      setCount(shown - 1);
      return;
    }
    const last = failed.current;
    const blocked =
      last !== null && last.content === content && last.count === shown + 1 && width <= last.width;
    if (shown < total && !blocked) {
      setCount(shown + 1);
      return;
    }
    settled.current = { count: shown, width, content };
  }, [enabled, width, shown, content, total]);

  return { shown, wouldHide: !enabled && wouldHide, containerRef: setContainer, tableRef: table };
}
