import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CaretRightIcon, ChevronDownIcon } from "./icons";

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Separator line before this entry, to mark a group. */
  separatorBefore?: boolean;
  /** Entries of a submenu: the entry then opens it rather than being chosen. */
  items?: MenuItem[];
  onSelect?: () => void;
}

const ITEM =
  "flex w-full items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-left text-ink hover:bg-surface focus:bg-surface focus:outline-none disabled:text-ink-muted/60 disabled:hover:bg-transparent";

/**
 * Button opening an action menu, following the "menu button" pattern of the ARIA
 * APG, like the account menu whose behaviour it reuses: the button announces the
 * menu and its state, opening from the keyboard puts the focus on the first entry,
 * the arrows, Home and End walk through the entries, Escape closes and gives the
 * focus back to the button. A click outside the menu, Tab or choosing an entry close
 * it too.
 *
 * An entry with `items` opens a submenu beside it, by the mouse, Enter, Space or
 * the right arrow; within it the arrows walk its own entries, and the left arrow
 * or Escape give the focus back to the entry that opened it.
 */
export function MenuButton({
  label,
  items,
  disabled = false,
  className = "",
  prominent = false,
  icon,
}: {
  label: string;
  items: MenuItem[];
  disabled?: boolean;
  className?: string;
  /**
   * A menu the page is used for, such as the actions on the selection: a pill,
   * outlined and tinted with the accent, filled when hovered or open. The plain one, for a
   * secondary menu, is muted. A primary button, filled, stays apart from both.
   */
  prominent?: boolean;
  /** Visual placed before the label. */
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Entry to focus on opening: the first one from the keyboard, none with the mouse.
  const focusOnOpen = useRef<"first" | "last" | null>(null);

  // The entries of the top level only: a submenu walks its own.
  function entries(): HTMLElement[] {
    return [
      ...(menu.current?.querySelectorAll<HTMLElement>(":scope > div > [role=menuitem]") ?? []),
    ];
  }

  useEffect(() => {
    if (!open) return;
    const target = focusOnOpen.current;
    focusOnOpen.current = null;
    if (target !== null) {
      const list = entries();
      (target === "first" ? list[0] : list[list.length - 1])?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || root.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const target =
      event.key === "ArrowDown" || event.key === "Enter" || event.key === " "
        ? "first"
        : event.key === "ArrowUp"
          ? "last"
          : null;
    if (target === null) return;
    event.preventDefault();
    if (open) {
      const list = entries();
      (target === "first" ? list[0] : list[list.length - 1])?.focus();
      return;
    }
    focusOnOpen.current = target;
    setOpen(true);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = entries();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(list.length - 1);
        break;
      case "Escape":
        // The side panel listens for Escape at the document level: close the menu only.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => {
          setOpen((previous) => !previous);
        }}
        onKeyDown={onButtonKeyDown}
        className={
          prominent
            ? "flex h-7 items-center gap-1.5 rounded-(--radius-pill) border border-accent bg-accent-soft pr-2.5 pl-3 font-medium text-ink hover:bg-accent hover:text-accent-ink disabled:opacity-60 aria-expanded:bg-accent aria-expanded:text-accent-ink"
            : "flex h-7 items-center gap-1.5 rounded-(--radius-control) border border-line px-2 text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-60 aria-expanded:text-ink"
        }
      >
        {icon}
        {label}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 z-30 mt-1 min-w-56 rounded-(--radius-panel) border border-line bg-surface-raised p-1 shadow-lg"
        >
          {items.map((item) => (
            <MenuEntry
              key={item.key}
              item={item}
              onChosen={() => {
                close(true);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * An entry of a menu: a choice, or the opener of a submenu shown beside it.
 */
function MenuEntry({ item, onChosen }: { item: MenuItem; onChosen: () => void }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const subId = useId();
  const sub = item.items;

  function subEntries(): HTMLElement[] {
    return [
      ...(submenu.current?.querySelectorAll<HTMLElement>(":scope > div > [role=menuitem]") ?? []),
    ];
  }

  function openSub(focus: boolean) {
    setOpen(true);
    if (focus) window.requestAnimationFrame(() => subEntries()[0]?.focus());
  }

  function closeSub() {
    setOpen(false);
    opener.current?.focus();
  }

  function onSubKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = subEntries();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(list.length - 1);
        break;
      case "ArrowLeft":
      case "Escape":
        event.preventDefault();
        closeSub();
        break;
      case "Tab":
        // Leaves the whole menu, as from the top level.
        return;
      default:
        return;
    }
    // The keys a submenu handles do not walk the parent menu too.
    event.stopPropagation();
  }

  return (
    <div
      className="relative"
      onPointerEnter={() => {
        if (sub !== undefined) setOpen(true);
      }}
      onPointerLeave={() => {
        if (sub !== undefined) setOpen(false);
      }}
    >
      {item.separatorBefore === true && (
        <div role="separator" className="my-1 border-t border-line" />
      )}
      <button
        ref={opener}
        type="button"
        role="menuitem"
        tabIndex={-1}
        disabled={item.disabled}
        aria-haspopup={sub === undefined ? undefined : "menu"}
        aria-expanded={sub === undefined ? undefined : open}
        aria-controls={sub === undefined ? undefined : subId}
        onClick={() => {
          if (sub !== undefined) {
            openSub(true);
            return;
          }
          onChosen();
          item.onSelect?.();
        }}
        onKeyDown={(event) => {
          if (sub !== undefined && event.key === "ArrowRight") {
            event.preventDefault();
            event.stopPropagation();
            openSub(true);
          }
        }}
        className={ITEM}
      >
        {item.icon}
        <span className="flex-1">{item.label}</span>
        {sub !== undefined && <CaretRightIcon className="h-3.5 w-3.5 text-ink-muted" />}
      </button>
      {sub !== undefined && open && (
        <div
          ref={submenu}
          id={subId}
          role="menu"
          aria-label={item.label}
          onKeyDown={onSubKeyDown}
          className="absolute top-0 left-full z-40 ml-1 min-w-56 rounded-(--radius-panel) border border-line bg-surface-raised p-1 shadow-lg"
        >
          {sub.map((child) => (
            <MenuEntry key={child.key} item={child} onChosen={onChosen} />
          ))}
        </div>
      )}
    </div>
  );
}
