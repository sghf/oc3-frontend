import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPlacement } from "./use-anchored-placement";

/**
 * The control an opening focuses: the one marked `data-autofocus`, or else the
 * first one.
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

/**
 * A button opening a compact popover. A click, a tap, Enter, Space or the down
 * arrow open it, the focus on its first control; hovering the button does not.
 * It stays until a click on the button again, Escape, a click outside or the
 * focus leaving it; Escape gives the focus back to the button.
 *
 * The popover is rendered in `document.body` and placed under the button, so
 * that the scrolling container of a table header does not clip it.
 */
export function Popover({
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
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useAnchoredPlacement(open, button, panel, { matchWidth: false });

  function hide(returnFocus = false) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function inside(node: Node) {
    return button.current?.contains(node) === true || panel.current?.contains(node) === true;
  }

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

  // Focus the first control once the popover is attached.
  useEffect(() => {
    if (open) firstControl(panel.current)?.focus();
  }, [open]);

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
        onClick={(event) => {
          // A header button sorts on click: the filter button does not.
          event.stopPropagation();
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
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
