import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import {
  CaretRightIcon,
  CloseIcon,
  PulseIcon,
  SearchIcon,
  SlidersIcon,
} from "@/components/ui/icons";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useNavCollapsedPref, useNavViewPref } from "@/lib/user-prefs";
import { labelMatches, normalizeSearch } from "@/lib/label-search";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { useHiddenMenuEntries } from "@/lib/api/hidden-menu-entries";
import {
  NAV_CATEGORIES,
  NAV_TOP,
  NAV_VIEWS,
  viewOfPath,
  type NavCategory,
  type NavEntry,
  type NavView,
} from "./navigation";

const LINK =
  "flex items-center gap-2 rounded-(--radius-control) px-2 py-1 text-ink-muted hover:text-ink";
const LINK_ACTIVE = { className: "bg-accent-soft text-ink" };

function NavLink({ entry }: { entry: NavEntry }) {
  const { t } = useTranslation();
  return (
    <li>
      <Link
        to={entry.to}
        activeOptions={entry.exact === true ? { exact: true } : undefined}
        className={LINK}
        activeProps={LINK_ACTIVE}
      >
        {/* The icon keeps its tint in every state: it identifies the view, and the
            background and the label are what mark the selection. */}
        <ObjectIcon kind={entry.icon} />
        {t(entry.labelKey)}
      </Link>
    </li>
  );
}

const VIEW_ICON = { operator: PulseIcon, admin: SlidersIcon } as const;

/**
 * The choice between the two menus, at the top of the side menu: a sunken track
 * and a raised thumb sliding to the menu chosen, each named in words beside its
 * icon, the one in use in the ink and its icon in the accent. A radio group: the
 * arrows switch from one to the other. The slide is skipped for whoever asks for
 * reduced motion.
 */
function ViewSwitch({ view, onChange }: { view: NavView; onChange: (view: NavView) => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t("nav.viewLabel")}
      aria-keyshortcuts="v"
      className="relative mb-2 grid h-8 grid-cols-2 rounded-full bg-surface-sunken p-[3px]"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        // Left and right choose; up and down go on through the menu.
        event.preventDefault();
        event.stopPropagation();
        const next = view === "operator" ? "admin" : "operator";
        onChange(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus();
      }}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-surface-raised shadow-sm ring-1 ring-line transition-transform duration-200 ease-out motion-reduce:transition-none ${
          view === "admin" ? "translate-x-full" : ""
        }`}
      />
      {NAV_VIEWS.map((option) => {
        const checked = option === view;
        const Icon = VIEW_ICON[option];
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={checked}
            data-view={option}
            // The group is one stop of the keyboard path, on the menu chosen.
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              onChange(option);
            }}
            className={`relative inline-flex items-center justify-center gap-1.5 rounded-full text-data font-medium transition-colors ${
              checked ? "text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon width={13} height={13} className={checked ? "text-accent" : undefined} />
            {t(`nav.views.${option}`)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Side menu. Foldable: on a narrow screen, or when a wide table needs all the room.
 * Folded, it keeps its place in the grid but not its width, and `inert` takes it out
 * of the keyboard path. Each section folds too, and the account keeps which ones
 * are folded; all are open by default.
 *
 * From the keyboard, "n" brings the focus here, in the filter field (`AppShell`);
 * the arrows then move from one entry or section title to the next, Home and End go
 * to the ends, and Escape gives the focus back to the page.
 *
 * An entry needing a privilege (`NavEntry.privileges`) shows only to a user who
 * holds it, the impersonated user while impersonating; a section left empty goes.
 * Until the privileges are read, those entries wait; should they not be read, they
 * show: the menu does not lose its way to the views, the API checking the actions.
 * An entry every organizational group of the user hides
 * (`/groups/{id}/hidden_menu_entries`, see `useHiddenMenuEntries`) does not show
 * either: a choice of the teams, not a right, its view staying open to its address.
 *
 * Two menus, chosen at the top (`ViewSwitch`, or "v" anywhere): operator, to watch
 * and act, and admin, to set the collector up. The choice is kept for the account,
 * and follows the page: opening a page of the other menu, by a link, the search, a
 * bookmark or an address, switches to it, so that the page on display is always
 * marked in the menu.
 *
 * The field at the top filters the entries by their name, or by the name of their
 * section, in English or in French whatever the language on display, without case
 * nor accents. While it filters, the sections holding a match
 * are open whatever their saved state, the others go; the matches of the other
 * menu follow, under its name. Enter opens the first entry left, Escape empties the
 * field, the down arrow goes on to the entries.
 */
export function Sidebar({ open }: { open: boolean }) {
  const { t, i18n } = useTranslation();
  const sections = useNavCollapsedPref();
  const privileges = useEffectivePrivileges();
  const [query, setQuery] = useState("");
  const needle = normalizeSearch(query.trim());
  const filtering = needle !== "";
  // In English and in French, whichever the interface shows.
  const matches = (key: string) => labelMatches(i18n, key, needle);
  const hidden = useHiddenMenuEntries();
  // Rights first, then the choice of the teams: an entry every organizational group
  // of the user hides is not shown. Not known yet, or not readable, nothing is
  // hidden: the menu does not wait for it.
  const allowed = (entry: NavEntry) =>
    (entry.privileges === undefined ||
      privileges.isError ||
      (privileges.data !== undefined && hasPrivilege(privileges.data, entry.privileges))) &&
    hidden.data?.has(entry.menuId) !== true;
  const shown = (entry: NavEntry) => allowed(entry) && (!filtering || matches(entry.labelKey));

  const { view, ready, setView } = useNavViewPref();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pageView = viewOfPath(pathname);
  // The menu follows the page when the page changes, not when the user switches;
  // and once the stored choice is read, so that it does not override the page.
  useEffect(() => {
    if (ready && pageView !== null) setView(pageView);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on page changes only
  }, [pageView, ready]);

  const categoriesOf = (of: NavView) =>
    NAV_CATEGORIES.filter((category) => category.view === of)
      .map((category) => {
        const visible = category.entries.filter(allowed);
        // A section found by its name keeps all its entries.
        const entries = filtering && !matches(category.labelKey) ? visible.filter(shown) : visible;
        return { category, entries };
      })
      .filter(({ entries }) => entries.length > 0);
  const other: NavView = view === "operator" ? "admin" : "operator";
  const top = view === "operator" ? NAV_TOP.filter(shown) : [];
  const categories = categoriesOf(view);
  // While filtering, the matches of the other menu, after those of this one.
  const otherTop = filtering && other === "operator" ? NAV_TOP.filter(shown) : [];
  const otherCategories = filtering ? categoriesOf(other) : [];
  const nothing =
    filtering &&
    top.length === 0 &&
    categories.length === 0 &&
    otherTop.length === 0 &&
    otherCategories.length === 0;

  const renderCategories = (list: { category: NavCategory; entries: NavEntry[] }[]) =>
    list.map(({ category, entries }) => {
      // While filtering, a section holding a match is open, its saved state kept.
      const expanded = filtering || !sections.isCollapsed(category.key);
      return (
        <section key={category.key} className="mt-3">
          <h2 className="text-data font-semibold text-ink-muted uppercase">
            <button
              type="button"
              id={`nav-category-${category.key}`}
              // Held open while filtering: not a stop then, the arrows going from
              // the field straight to the entries.
              tabIndex={filtering ? -1 : undefined}
              aria-expanded={expanded}
              aria-controls={`nav-entries-${category.key}`}
              onClick={() => {
                if (!filtering) sections.toggle(category.key);
              }}
              className="flex w-full items-center gap-1 rounded-(--radius-control) px-2 py-1 text-left uppercase hover:text-ink"
            >
              <CaretRightIcon
                className={`h-2.5 w-2.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
              {t(category.labelKey)}
            </button>
          </h2>
          <ul
            id={`nav-entries-${category.key}`}
            aria-labelledby={`nav-category-${category.key}`}
            hidden={!expanded}
          >
            {entries.map((entry) => (
              <NavLink key={entry.to} entry={entry} />
            ))}
          </ul>
        </section>
      );
    });

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // In the field, the keys edit the text, but the down arrow, which goes on to
    // the entries.
    const inField = event.target instanceof HTMLInputElement;
    if (inField && event.key !== "ArrowDown" && event.key !== "Escape") return;
    if (event.key === "Escape") {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }
    // The entries of a folded section are hidden, and the clear button of the field
    // is for the pointer: they are not stops.
    const stops = [...event.currentTarget.querySelectorAll<HTMLElement>("input, a, button")].filter(
      (element) => element.closest("[hidden]") === null && element.tabIndex !== -1,
    );
    const at = stops.findIndex((element) => element === document.activeElement);
    const next =
      event.key === "ArrowDown"
        ? stops[Math.min(at + 1, stops.length - 1)]
        : event.key === "ArrowUp"
          ? stops[Math.max(at - 1, 0)]
          : event.key === "Home"
            ? stops[0]
            : event.key === "End"
              ? stops[stops.length - 1]
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    next.focus();
  }

  return (
    <aside
      id="app-sidebar"
      inert={!open}
      className={`overflow-hidden border-r border-line bg-surface-raised transition-[width] duration-200 ease-out ${
        open ? "w-52" : "w-0 border-r-0"
      }`}
    >
      <nav
        aria-label={t("nav.main")}
        aria-keyshortcuts="n"
        onKeyDown={onKeyDown}
        className="w-52 p-2"
      >
        <ViewSwitch view={view} onChange={setView} />

        <div className="mb-2 flex h-7 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted focus-within:border-accent">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query !== "") {
                // Not to the menu, which would leave it: the field empties first.
                event.stopPropagation();
                setQuery("");
              } else if (event.key === "Enter") {
                const first = event.currentTarget
                  .closest("nav")
                  ?.querySelector<HTMLAnchorElement>("a:not([hidden] a)");
                if (first !== null && first !== undefined) {
                  event.preventDefault();
                  first.click();
                  setQuery("");
                }
              }
            }}
            placeholder={t("nav.filter")}
            aria-label={t("nav.filter")}
            className="w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
              }}
              // For the pointer: from the keyboard, Escape empties the field.
              tabIndex={-1}
              aria-label={t("nav.clearFilter")}
              title={t("nav.clearFilter")}
              className="shrink-0 hover:text-ink"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        {nothing && (
          <p role="status" className="px-2 py-1 text-ink-muted">
            {t("nav.noMatch")}
          </p>
        )}

        {top.length > 0 && (
          <ul>
            {top.map((entry) => (
              <NavLink key={entry.to} entry={entry} />
            ))}
          </ul>
        )}

        {renderCategories(categories)}

        {(otherTop.length > 0 || otherCategories.length > 0) && (
          <div className="mt-4 border-t border-line pt-2">
            <p className="px-2 text-data font-medium text-ink-muted">
              {t("nav.inView", { view: t(`nav.views.${other}`) })}
            </p>
            {otherTop.length > 0 && (
              <ul className="mt-1">
                {otherTop.map((entry) => (
                  <NavLink key={entry.to} entry={entry} />
                ))}
              </ul>
            )}
            {renderCategories(otherCategories)}
          </div>
        )}
      </nav>
    </aside>
  );
}
