import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPlacement } from "./use-anchored-placement";

/** Pause before a hovered trigger opens its popover: crossing it opens nothing. */
const OPEN_DELAY = 150;
/** Pause before a popover the pointer left closes: time to reach it from its trigger. */
const CLOSE_DELAY = 300;

/**
 * The control a pinned opening focuses: the one marked `data-autofocus`, or else
 * the first one.
 */
const FIRST_CONTROL = "input:not([disabled]), select, button:not([disabled]), [tabindex='0']";

/**
 * The control to focus in a popover: the one marked `data-autofocus` first, a
 * selector list matching in document order rather than in its own order.
 */
function firstControl(panel: HTMLElement | null): HTMLElement | null {
  return (
    panel?.querySelector<HTMLElement>("[data-autofocus]") ??
    panel?.querySelector<HTMLElement>(FIRST_CONTROL) ??
    null
  );
}

/** Announces an opening: the other popovers not pinned close. */
const OPEN_EVENT = "hover-popover-open";

/**
 * A button opening a compact popover, by hovering it or by a click.
 *
 * Hovered with a mouse, the popover opens after `OPEN_DELAY` and closes
 * `CLOSE_DELAY` after the pointer left both the button and the popover. Used —
 * typed in, focused, clicked inside — it is pinned: it then stays until Escape, a
 * click outside or the focus leaving it. A click, a tap, Enter, Space or the down
 * arrow open it pinned, the focus on its first control; Escape gives the focus
 * back to the button. A popover opening closes the others not pinned.
 *
 * The popover is rendered in `document.body` and placed under the button, so
 * that the scrolling container of a table header does not clip it.
 */
export function HoverPopover({
  trigger,
  label,
  panelLabel,
  className = "",
  children,
}: {
  /** Content of the button: an icon. */
  trigger: ReactNode;
  /** Accessible name and tooltip of the button. */
  label: string;
  /** Accessible name of the popover. */
  panelLabel: string;
  className?: string;
  /**
   * The content, or a function of `close`, which closes the popover and gives the
   * focus back to its button: for a control that finishes the popover's job.
   */
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Focus the first control once the popover is attached, after a pinned opening.
  const focusOnOpen = useRef(false);
  useAnchoredPlacement(open, button, panel, { matchWidth: false });

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  function show(pin: boolean) {
    clearTimeout(timer.current);
    if (pin) setPinned(true);
    if (!open) {
      setOpen(true);
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    }
  }

  function hide(returnFocus = false) {
    clearTimeout(timer.current);
    setOpen(false);
    setPinned(false);
    if (returnFocus) button.current?.focus();
  }

  function later(action: () => void, delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(action, delay);
  }

  function inside(node: Node) {
    return button.current?.contains(node) === true || panel.current?.contains(node) === true;
  }

  // Another popover opening closes this one, unless it is in use.
  useEffect(() => {
    if (!open || pinned) return;
    function onOther(event: Event) {
      if (event instanceof CustomEvent && event.detail !== id) hide();
    }
    window.addEventListener(OPEN_EVENT, onOther);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOther);
    };
  }, [open, pinned, id]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || inside(event.target)) return;
      hide();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    firstControl(panel.current)?.focus();
  }, [open]);

  function openPinned() {
    focusOnOpen.current = true;
    show(true);
    // Already open from a hover: the effect does not run again.
    if (open) {
      focusOnOpen.current = false;
      firstControl(panel.current)?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && open) {
      // Not to the side panel, which closes on Escape at the document level.
      event.stopPropagation();
      hide(true);
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={label}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && !open) later(() => show(false), OPEN_DELAY);
          else if (event.pointerType === "mouse") clearTimeout(timer.current);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          if (!open) clearTimeout(timer.current);
          else if (!pinned) later(hide, CLOSE_DELAY);
        }}
        onClick={(event) => {
          // A header button sorts on click: the filter button does not.
          event.stopPropagation();
          if (open && pinned) hide();
          else openPinned();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openPinned();
          } else onKeyDown(event);
        }}
        className={className}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={panelLabel}
            tabIndex={-1}
            onPointerEnter={() => {
              clearTimeout(timer.current);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse" && !pinned) later(hide, CLOSE_DELAY);
            }}
            onPointerDown={() => {
              setPinned(true);
            }}
            onFocus={() => {
              setPinned(true);
            }}
            onKeyDown={onKeyDown}
            onBlur={(event) => {
              // React carries the events of the popover here although it lives in
              // the body: the focus leaving both closes it.
              if (!(event.relatedTarget instanceof Node) || !inside(event.relatedTarget)) {
                if (event.relatedTarget !== null) hide();
              }
            }}
            className="fixed z-30 flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col gap-2 overflow-y-auto rounded-(--radius-panel) border border-line bg-surface-raised p-2 text-data font-normal text-ink shadow-lg outline-none"
          >
            {typeof children === "function"
              ? children(() => {
                  hide(true);
                })
              : children}
          </div>,
          document.body,
        )}
    </>
  );
}
