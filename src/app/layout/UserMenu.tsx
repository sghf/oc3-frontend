import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { SignOutIcon, UserIcon } from "@/components/ui/icons";
import { stopImpersonating } from "@/lib/session";
import { logOut } from "@/lib/api/session-auth";
import { useImpersonation } from "@/lib/api/impersonation";
import { ImpersonateDialog } from "@/features/users/ImpersonateDialog";
import { useCanImpersonate } from "@/features/users/use-impersonate";
import { setShortcutsHelp } from "@/lib/shortcuts";

const ITEM =
  "flex w-full items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-left text-ink hover:bg-surface focus:bg-surface focus:outline-none";

/**
 * Account menu, opened from the user icon in the top bar.
 *
 * It follows the "menu button" pattern of the ARIA APG: the button announces the
 * menu and its state, opening from the keyboard puts the focus on the first entry,
 * the arrows, Home and End walk through the entries, Escape closes and gives the
 * focus back to the button. A click outside the menu, Tab or choosing an entry close
 * it too.
 */
export function UserMenu({ user }: { user: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const impersonation = useImpersonation();
  const canImpersonate = useCanImpersonate();
  const [impersonating, setImpersonating] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Entry to focus on opening: the first one from the keyboard, none with the mouse.
  const focusOnOpen = useRef<"first" | "last" | null>(null);

  function items(): HTMLElement[] {
    return [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
  }

  useEffect(() => {
    if (!open) return;
    const target = focusOnOpen.current;
    focusOnOpen.current = null;
    if (target !== null) {
      const list = items();
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
      // Menu already opened with the mouse: the focus stayed on the button.
      const list = items();
      (target === "first" ? list[0] : list[list.length - 1])?.focus();
      return;
    }
    focusOnOpen.current = target;
    setOpen(true);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
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
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        // The icon alone in the bar: the user is named in the tooltip, to assistive
        // technologies and at the head of the menu.
        title={t("header.accountMenuOf", { user })}
        aria-label={t("header.accountMenuOf", { user })}
        onClick={() => {
          setOpen((previous) => !previous);
        }}
        onKeyDown={onButtonKeyDown}
        className="flex items-center rounded-(--radius-control) p-1 text-ink-muted hover:text-ink aria-expanded:text-ink"
      >
        <ObjectIcon kind="user" className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={t("header.accountMenu")}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-1 min-w-48 rounded-(--radius-panel) border border-line bg-surface-raised p-1 shadow-lg"
        >
          {/* Who is signed in: text, not an entry, which the arrows skip. */}
          <p className="mb-1 truncate border-b border-line px-2 pt-1 pb-1.5 text-data text-ink-muted">
            {t("header.signedInAs", { user })}
          </p>
          <Link
            to="/profile"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              close(false);
            }}
            className={ITEM}
          >
            <ObjectIcon kind="user" />
            {t("profile.title")}
          </Link>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-keyshortcuts="?"
            onClick={() => {
              close(false);
              setShortcutsHelp(true);
            }}
            className={ITEM}
          >
            <kbd
              aria-hidden="true"
              className="flex h-4 w-4 items-center justify-center rounded-sm border border-line font-mono text-data text-ink-muted"
            >
              ?
            </kbd>
            {t("shortcuts.title")}
          </button>
          <div role="separator" className="my-1 border-t border-line" />
          {impersonation === null && canImpersonate && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-haspopup="dialog"
              onClick={() => {
                close(false);
                setImpersonating(true);
              }}
              className={ITEM}
            >
              <UserIcon className="text-ink-muted" />
              {t("impersonation.menu")}
            </button>
          )}
          {impersonation !== null && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false);
                stopImpersonating();
              }}
              className={ITEM}
            >
              <UserIcon className="text-state-warn" />
              {t("impersonation.stop")}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              void logOut();
            }}
            className={ITEM}
          >
            <SignOutIcon className="text-ink-muted" />
            {t("auth.signOut")}
          </button>
        </div>
      )}
      {impersonating && (
        <ImpersonateDialog
          onClose={() => {
            setImpersonating(false);
          }}
        />
      )}
    </div>
  );
}
