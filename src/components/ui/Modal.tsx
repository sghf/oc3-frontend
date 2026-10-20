import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

/** Marks a modal's backdrop: a click on it closes the modal, not the side panel under it. */
export const MODAL_BACKDROP = "[data-modal-backdrop]";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A window over the page, its title and a cross at the top. Escape, the cross or
 * a click beside it close it, and only it: a side panel under it stays open. The
 * focus goes inside, stays there and goes back where it was. Drawn over the whole
 * window, out of the panel that opens it.
 */
export function Modal({
  title,
  onClose,
  closeLabel,
  children,
  className = "max-w-3xl",
}: {
  title: ReactNode;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  /** Width of the window. */
  className?: string;
}) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.focus();
    return () => {
      if (opener.current instanceof HTMLElement && document.contains(opener.current))
        opener.current.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // The side panel listens for Escape too: it stays open under the modal.
      event.stopPropagation();
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialog.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      data-modal-backdrop=""
      className="fixed inset-0 z-40 flex items-start justify-center bg-ink/20 px-4 pt-[10vh]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`flex max-h-[80vh] w-full flex-col rounded-(--radius-panel) border border-line bg-surface-raised shadow-xl outline-none ${className}`}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <h2 id={`${id}-title`} className="min-w-0 text-title font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title={closeLabel}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-control) border border-line text-ink-muted hover:text-ink"
          >
            <CloseIcon />
            <span className="sr-only">{closeLabel}</span>
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
