import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { CaretRightIcon, CloseIcon, SearchIcon } from "@/components/ui/icons";
import { useState, type KeyboardEvent } from "react";
import { useNavCollapsedPref } from "@/lib/user-prefs";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { NAV_CATEGORIES, NAV_TOP, type NavEntry } from "./navigation";

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

/** Text compared without case nor accents: "securite" finds "Sécurité". */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
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
 *
 * The field at the top filters the entries by their name, or by the name of their
 * section, without case nor accents. While it filters, the sections holding a match
 * are open whatever their saved state, the others go; Enter opens the first entry
 * left, Escape empties the field, the down arrow goes on to the entries.
 */
export function Sidebar({ open }: { open: boolean }) {
  const { t } = useTranslation();
  const sections = useNavCollapsedPref();
  const privileges = useEffectivePrivileges();
  const [query, setQuery] = useState("");
  const needle = normalize(query.trim());
  const filtering = needle !== "";
  const matches = (text: string) => normalize(text).includes(needle);
  const allowed = (entry: NavEntry) =>
    entry.privileges === undefined ||
    privileges.isError ||
    (privileges.data !== undefined && hasPrivilege(privileges.data, entry.privileges));
  const shown = (entry: NavEntry) => allowed(entry) && (!filtering || matches(t(entry.labelKey)));

  const top = NAV_TOP.filter(shown);
  const categories = NAV_CATEGORIES.map((category) => {
    const visible = category.entries.filter(allowed);
    // A section found by its name keeps all its entries.
    const entries = filtering && !matches(t(category.labelKey)) ? visible.filter(shown) : visible;
    return { category, entries };
  }).filter(({ entries }) => entries.length > 0);
  const nothing = filtering && top.length === 0 && categories.length === 0;

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

        {categories.map(({ category, entries }) => {
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
        })}
      </nav>
    </aside>
  );
}
