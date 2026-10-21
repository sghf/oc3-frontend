/**
 * The windows where a side panel leaves part of the view beside it; a narrower one
 * is filled by the panel. The classes are written out in full: Tailwind does not
 * see names built at runtime.
 */
export type SlideOverSize = "default" | "wide" | "wider";

/** Shown only where the panel leaves room beside it: the button moving it to the other edge. */
export const ROOM_BESIDE: Record<SlideOverSize, string> = {
  default: "hidden md:flex",
  wide: "hidden lg:flex",
  wider: "hidden xl:flex",
};

/**
 * Where a panel can be resized by its left edge: the same windows, a narrower one
 * being filled by the panel anyway. The handle shows there only.
 */
export const RESIZE_VISIBLE: Record<SlideOverSize, string> = {
  default: "hidden md:block",
  wide: "hidden lg:block",
  wider: "hidden lg:block",
};

/**
 * Width of a resized panel, read from `--panel-width`, in those same windows. It
 * always leaves `LEFT_ROOM` of the view beside it, whatever the window became since
 * the width was chosen.
 */
export const RESIZED_WIDTH: Record<SlideOverSize, string> = {
  default: "md:max-w-[min(var(--panel-width),calc(100vw_-_12rem))]",
  wide: "lg:max-w-[min(var(--panel-width),calc(100vw_-_12rem))]",
  wider: "lg:max-w-[min(var(--panel-width),calc(100vw_-_12rem))]",
};
