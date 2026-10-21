import { useSyncExternalStore } from "react";
import type { SlideOverSize } from "./slide-over-layout";

/**
 * Widths the user gave the side panels by dragging their left edge, one per size of
 * panel: widening the record of a node does not widen the creation forms.
 *
 * Kept in the browser rather than with the account: the right width depends on the
 * screen, and the same user on a laptop and on a wide monitor wants two of them.
 * Every panel of a size shares the width, so that the panels which follow one
 * another in the history do not jump.
 */

const STORAGE_KEY = "oc3.panel-width";

/** Narrowest a panel gets, in pixels: its header and a form still fit. */
export const MIN_WIDTH = 320;

/** Room a resized panel leaves of the view beside it, in pixels: the panel is never the whole window. */
export const LEFT_ROOM = 192;

/** Width of each size before any resize, in pixels: what its `max-w-*` class gives. */
export const DEFAULT_WIDTH: Record<SlideOverSize, number> = {
  default: 576,
  wide: 768,
  wider: 896,
};

type Widths = Partial<Record<SlideOverSize, number>>;

function read(): Widths {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof raw !== "object" || raw === null) return {};
    const widths: Widths = {};
    for (const size of Object.keys(DEFAULT_WIDTH) as SlideOverSize[]) {
      const value = (raw as Record<string, unknown>)[size];
      if (typeof value === "number" && Number.isFinite(value) && value >= MIN_WIDTH)
        widths[size] = value;
    }
    return widths;
  } catch {
    // Storage refused or unreadable: the panels keep their default widths.
    return {};
  }
}

let widths = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Width chosen for the panels of a size, or undefined for the default one. */
export function usePanelWidth(size: SlideOverSize): number | undefined {
  return useSyncExternalStore(subscribe, () => widths[size]);
}

/**
 * The width a panel may take in the current window, `floor` being the narrowest its
 * content allows (`contentFloor`). The window wins over the content: a panel never
 * takes the room left beside it.
 */
export function clampWidth(width: number, floor = MIN_WIDTH): number {
  const max = Math.max(MIN_WIDTH, window.innerWidth - LEFT_ROOM);
  return Math.round(Math.min(Math.max(width, floor, MIN_WIDTH), max));
}

/**
 * The narrowest a panel can get before its content needs a horizontal scrollbar.
 *
 * Measured rather than declared, since it depends on what the panel shows: the
 * panel is narrowed to `MIN_WIDTH` for the time of a layout, never painted, and what
 * then sticks out of its parts, or of the scrolling areas inside them, is what it
 * lacks. Areas that already scroll sideways at the current width are left out: a
 * long line of a file or a table of thirty columns scrolls whatever the panel
 * does, and counting them would forbid any narrowing.
 */
export function contentFloor(panel: HTMLElement): number {
  const fitting = widthBound(panel).filter((element) => element.scrollWidth <= element.clientWidth);
  const before = panel.style.maxWidth;
  panel.style.maxWidth = `${String(MIN_WIDTH)}px`;
  let lacking = 0;
  for (const element of fitting)
    lacking = Math.max(lacking, element.scrollWidth - element.clientWidth);
  panel.style.maxWidth = before;
  return MIN_WIDTH + lacking;
}

/** Marks an area made to scroll sideways, whatever its width: no reason to widen the panel. */
const SCROLLS_BY_DESIGN = "[data-panel-fit='scroll']";

/**
 * What may not fit in the width of a panel: its parts, and the areas scrolling
 * sideways inside. Left out, what is not on display — the content of a closed
 * `<details>` is laid out all the same — and the areas marked as scrolling by
 * design (`data-panel-fit="scroll"`), such as the table of values of a chart.
 */
function widthBound(panel: HTMLElement): HTMLElement[] {
  const parts = Array.from(panel.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && getComputedStyle(child).position !== "absolute",
  );
  const scrollers = Array.from(panel.querySelectorAll<HTMLElement>("*")).filter((element) => {
    const overflow = getComputedStyle(element).overflowX;
    return (
      (overflow === "auto" || overflow === "scroll") &&
      element.closest(SCROLLS_BY_DESIGN) === null &&
      element.checkVisibility()
    );
  });
  return [...new Set([...parts, ...scrollers])];
}

/**
 * The width a panel should take for its content to show without a horizontal
 * scrollbar, or null when it fits already. What would not fit even in the widest
 * panel the window allows — a long line of a file — is left out: it scrolls
 * whatever the panel does, and is no reason to fill the window.
 */
export function widthToFit(panel: HTMLElement): number | null {
  const current = panel.getBoundingClientRect().width;
  const max = window.innerWidth - LEFT_ROOM;
  let needed = 0;
  for (const element of widthBound(panel)) {
    const lacking = element.scrollWidth - element.clientWidth;
    if (lacking <= 0) continue;
    // One more pixel: both measures are rounded.
    const width = Math.ceil(current + lacking) + 1;
    if (width <= max) needed = Math.max(needed, width);
  }
  return needed > current ? needed : null;
}

/**
 * Sets the width of the panels of a size, or gives them back the default one with
 * undefined. `remember` is false while the edge is being dragged: only the width it
 * is released at is worth keeping. `floor` is the narrowest the content of the panel
 * being resized allows.
 */
export function setPanelWidth(
  size: SlideOverSize,
  width: number | undefined,
  remember = true,
  floor = MIN_WIDTH,
) {
  const next = { ...widths };
  if (width === undefined) delete next[size];
  else next[size] = clampWidth(width, floor);
  widths = next;
  for (const listener of listeners) listener();
  if (!remember) return;
  try {
    if (Object.keys(widths).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Not kept: the width still holds until the page is reloaded.
  }
}
