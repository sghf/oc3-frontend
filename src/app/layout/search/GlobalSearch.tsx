import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { typing } from "@/lib/shortcuts";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { StatusBadge } from "@/components/opensvc/StatusBadge";
import { usePeek } from "@/components/opensvc/use-peek";
import {
  kindLabel,
  usePanelHistory,
  useShownRecord,
  type HistoryEntry,
} from "@/components/opensvc/panel-history";
import { GroupHeading, GroupingSwitch } from "@/components/opensvc/RecentRecords";
import { CloseIcon, HistoryIcon, SearchIcon, TrashIcon } from "@/components/ui/icons";
import { formatRelativeInstant } from "@/lib/format";
import { useHistoryGrouping } from "@/lib/user-prefs";
import {
  KIND_ICON,
  KIND_PREFIX,
  SEARCH_KINDS,
  listOfMatches,
  parseSearchInput,
  toHit,
  withKindPrefix,
  type ListTarget,
  type SearchHit,
  type SearchKind,
} from "./search-kinds";

/** Shorter texts are not sent: the server would answer nothing anyway. */
const MIN_LENGTH = 2;
/** Pause in the typing before the search goes out. */
const DEBOUNCE_MS = 200;
/** Hits per kind: a few across every kind, more within one. */
const LIMIT_ALL = 5;
const LIMIT_ONE = 20;

type Scope = SearchKind | "all";

interface Group {
  kind: SearchKind;
  hits: SearchHit[];
  /** The list view filtered on the column the text was found in, when the kind has one. */
  list: ListTarget | undefined;
  more: boolean;
  error: boolean;
}

/**
 * The first hit of each object: a disk attached to several services comes back
 * once per service, the list reading it through svcdisks.
 */
function unique(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => !seen.has(hit.key) && seen.add(hit.key));
}

/** The typed text, once the user has paused. */
function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

function useGlobalSearch(query: string, scope: Scope) {
  const { t, i18n } = useTranslation();
  const q = query.trim();
  return useQuery({
    queryKey: ["search", q, scope],
    enabled: Array.from(q).length >= MIN_LENGTH,
    // The previous results stay while the next ones load: no flicker as one types.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/search", {
        params: {
          query: {
            q,
            kinds: scope === "all" ? undefined : scope,
            limit: scope === "all" ? LIMIT_ALL : LIMIT_ONE,
          },
        },
        // A newer search cancels the one still under way.
        signal,
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.data.map((group): Group => ({
        kind: group.kind,
        hits: unique(
          group.items.flatMap((item) => {
            const hit = toHit(group.kind, item, t, i18n.language);
            return hit === null ? [] : [hit];
          }),
        ),
        list: listOfMatches(group.kind, q, group.items),
        more: group.more,
        error: group.error !== undefined,
      }));
    },
  });
}

/** The parts of a text that match the query, marked; case-insensitive. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return <>{text}</>;
  const lower = text.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark
        key={at}
        className="bg-transparent font-semibold text-ink underline decoration-accent underline-offset-2"
      >
        {text.slice(at, at + q.length)}
      </mark>,
    );
    from = at + q.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

/**
 * Global search of the collector, from the top bar.
 *
 * A compact field in the bar opens a command palette over the current view:
 * Ctrl+K (⌘K on a Mac) or "/" open it from anywhere. The results of
 * `GET /search` come grouped by kind, each with its icon, the facts that tell
 * homonyms apart and a short id. Choosing one opens its record in the panel over
 * the current view, as a badge does (`usePeek`); the kinds without a record panel
 * open their list, filtered on the object. Up and Down move through the results,
 * Enter opens, Escape closes; a scope narrows the search to one kind and shows
 * more of it. The scope is typed as a prefix, `node:dev` or `fset:prd`, as in the
 * historical collector: its badge lights up, and choosing a badge writes it.
 *
 * Nothing typed yet, it proposes the records shown recently in this browser tab
 * (`usePanelHistory`), grouped by how long ago or by kind, those of the kind in
 * scope only, the record on display said so; picked, one comes back in front.
 * Delete, or the cross of an entry, removes it; the bin clears them all. The om3
 * web application proposes its history the same way.
 */
export function GlobalSearch() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const shortcut = isMac() ? "⌘K" : "Ctrl K";

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const combo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (combo || (event.key === "/" && !typing(event.target) && !event.altKey)) {
        event.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K /"
        onClick={() => {
          setOpen(true);
        }}
        // Wide enough for the longest label, the French one; the shortcut never wraps.
        className="flex h-7 w-72 items-center gap-2 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted hover:border-line-strong"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">{t("header.search")}</span>
        <kbd className="ml-auto shrink-0 rounded-sm border border-line px-1 text-data whitespace-nowrap">
          {shortcut}
        </kbd>
      </button>
      {open && (
        <SearchPalette
          onClose={(restoreFocus) => {
            setOpen(false);
            // Closed without choosing: back to where the user was. A chosen
            // result opens a panel, which takes the focus itself.
            if (restoreFocus) window.setTimeout(() => trigger.current?.focus(), 0);
          }}
        />
      )}
    </>
  );
}

/** An option of the palette: a result of the search, or a record shown recently. */
type Option =
  | { type: "hit"; key: string; hit: SearchHit }
  | { type: "recent"; key: string; entry: HistoryEntry };

function SearchPalette({ onClose }: { onClose: (restoreFocus: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const peek = usePeek();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The scope is the prefix of the text, `node:dev`: the text alone says what is
  // searched, a badge only rewrites its prefix.
  const typed = parseSearchInput(query);
  const scope: Scope = typed.kind ?? "all";
  const debounced = parseSearchInput(useDebounced(query, DEBOUNCE_MS));
  const search = useGlobalSearch(debounced.text, debounced.kind ?? "all");
  const short = Array.from(typed.text.trim()).length < MIN_LENGTH;
  const grouping = useHistoryGrouping();
  const recent = usePanelHistory(useShownRecord(), grouping.value);
  // Nothing typed but a scope: the records shown recently, of the kind in scope.
  const proposing = typed.text.trim() === "";
  const recentGroups = recent.groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => scope === "all" || entry.step.kind === scope),
    }))
    .filter((group) => group.entries.length > 0);

  /** Narrows the search to a kind, or widens it to all, keeping the text. */
  function setScope(next: Scope) {
    setQuery((previous) => withKindPrefix(previous, next === "all" ? undefined : next));
  }

  const groups = useMemo(
    () => (short ? [] : (search.data ?? []).filter((g) => g.hits.length > 0 || g.error)),
    [search.data, short],
  );
  const options: Option[] = proposing
    ? recentGroups.flatMap((group) =>
        group.entries.map((entry) => ({ type: "recent" as const, key: entry.key, entry })),
      )
    : groups.flatMap((group) =>
        group.hits.map((hit) => ({ type: "hit" as const, key: hit.key, hit })),
      );
  const current = options[Math.min(active, options.length - 1)];
  const optionId = (option: Option) => `${id}-${option.type}-${option.key}`;
  const currentId = current === undefined ? undefined : optionId(current);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // A new result list starts on its first result.
  useEffect(() => {
    setActive(0);
  }, [search.data, scope, proposing]);

  useEffect(() => {
    if (currentId === undefined) return;
    document.getElementById(currentId)?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  function choose(option: Option) {
    onClose(false);
    if (option.type === "recent") {
      peek(option.entry.step.kind, option.entry.step.id);
      return;
    }
    const { target } = option.hit;
    if ("peek" in target) peek(target.peek.kind, target.peek.id);
    else void navigate(target.list);
  }

  /**
   * The option at `at` in the list: chosen by a click, made the active one by the
   * pointer. Told active by its place: the options are built anew at each render.
   */
  const optionProps = (option: Option, at: number) => {
    const selected = at === Math.min(active, options.length - 1);
    return {
      id: optionId(option),
      role: "option",
      "aria-selected": selected,
      onPointerMove: () => {
        if (!selected) setActive(at);
      },
      onClick: () => {
        choose(option);
      },
      className: `group mx-1 flex cursor-pointer items-center gap-3 rounded-(--radius-control) px-2 py-1.5 ${
        selected ? "bg-accent-soft" : ""
      }`,
    };
  };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onClose(true);
        return;
      case "ArrowDown":
      case "ArrowUp": {
        if (options.length === 0) return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive(
          (index) => (Math.min(index, options.length - 1) + step + options.length) % options.length,
        );
        return;
      }
      case "Delete":
        // A record shown recently, forgotten; the next one becomes the active one.
        if (event.target !== input.current || current?.type !== "recent") return;
        event.preventDefault();
        recent.remove(current.entry);
        return;
      case "Enter":
        if (event.target !== input.current || current === undefined) return;
        event.preventDefault();
        choose(current);
        return;
      case "Tab": {
        // The palette is modal: the focus stays inside it.
        const focusable = dialog.current?.querySelectorAll<HTMLElement>(
          "input, button:not([disabled]):not([tabindex='-1']), a[href]",
        );
        if (focusable === undefined || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
    }
  }

  const scopes: Scope[] = ["all", ...SEARCH_KINDS];
  const trimmed = debounced.text.trim();

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-ink/20 px-4 pt-[10vh]"
      onPointerDown={(event) => {
        // A click on the backdrop, not inside the palette, closes it.
        if (event.target === event.currentTarget) onClose(true);
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t("search.title")}
        onKeyDown={onKeyDown}
        className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-(--radius-panel) border border-line bg-surface-raised shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <SearchIcon className="h-5 w-5 shrink-0 text-ink-muted" />
          <input
            ref={input}
            // Not "search": its own clear button would double the close button.
            type="text"
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={`${id}-results`}
            aria-autocomplete="list"
            aria-activedescendant={currentId}
            aria-label={t("search.title")}
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            className="h-12 min-w-0 flex-1 bg-transparent text-title outline-none placeholder:text-ink-muted"
          />
          {search.isFetching && !short && (
            <span role="status" className="shrink-0 text-ink-muted">
              {t("search.searching")}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              onClose(true);
            }}
            title={t("search.close")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-control) text-ink-muted hover:text-ink"
          >
            <CloseIcon />
            <span className="sr-only">{t("search.close")}</span>
          </button>
        </div>

        <div
          role="group"
          aria-label={t("search.scopes")}
          className="flex flex-wrap gap-1 border-b border-line px-3 py-2"
        >
          {scopes.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              title={value === "all" ? undefined : `${KIND_PREFIX[value]}:`}
              onClick={() => {
                setScope(value);
                input.current?.focus();
              }}
              className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-data ${
                scope === value
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {value !== "all" && <ObjectIcon kind={KIND_ICON[value]} className="h-3.5 w-3.5" />}
              {value === "all" ? t("search.all") : t(`search.kinds.${value}`)}
            </button>
          ))}
        </div>

        <div
          id={`${id}-results`}
          role="listbox"
          aria-label={t("search.results")}
          className="min-h-0 flex-1 overflow-y-auto py-1"
        >
          {proposing && recent.entries.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1 text-ink-muted">
                <HistoryIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t("search.recent.title")}</span>
                <GroupingSwitch
                  value={grouping.value}
                  onChange={(next) => {
                    grouping.set(next);
                    input.current?.focus();
                  }}
                />
                <button
                  type="button"
                  title={t("panelHistory.clear")}
                  onClick={() => {
                    recent.clear();
                    input.current?.focus();
                  }}
                  // It deletes the records: the down fill.
                  className="flex h-6 items-center gap-1 rounded-(--radius-control) bg-state-down px-1.5 text-data font-medium text-surface-raised hover:brightness-110"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  {t("search.recent.clear")}
                </button>
              </div>
              {recentGroups.length === 0 && (
                <p className="px-3 py-6 text-center text-ink-muted">
                  {t("search.recent.noneOfKind")}
                </p>
              )}
              {recentGroups.map((group) => {
                const headingId = `${id}-recent-${group.key}`;
                return (
                  <div key={group.key} role="group" aria-labelledby={headingId} className="py-1">
                    <div className="flex items-center gap-2 px-3 py-1 text-data text-ink-muted">
                      <GroupHeading group={group} id={headingId} />
                    </div>
                    {group.entries.map((entry) => {
                      const option: Option = { type: "recent", key: entry.key, entry };
                      return (
                        <RecentRow
                          key={entry.key}
                          entry={entry}
                          kindShown={group.by === "time"}
                          when={formatRelativeInstant(entry.at, i18n.language)}
                          optionProps={optionProps(
                            option,
                            options.findIndex((o) => o.key === entry.key),
                          )}
                          onRemove={() => {
                            recent.remove(entry);
                            input.current?.focus();
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </>
          ) : short ? (
            <div className="flex flex-col gap-2 px-3 py-6 text-center text-ink-muted">
              <p>{t("search.hint")}</p>
              <p>{t("search.prefixHint")}</p>
            </div>
          ) : search.isError ? (
            <p role="alert" className="px-3 py-6 text-center text-state-down">
              ■ {search.error.message}
            </p>
          ) : search.isPending ? (
            <p className="px-3 py-6 text-center text-ink-muted">{t("search.searching")}</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-ink-muted">
              {t("search.none", { query: trimmed })}
            </p>
          ) : (
            groups.map((group) => {
              const headingId = `${id}-${group.kind}`;
              const inList = group.list;
              return (
                <div key={group.kind} role="group" aria-labelledby={headingId} className="py-1">
                  <div className="flex items-center gap-2 px-3 py-1 text-data text-ink-muted">
                    <ObjectIcon kind={KIND_ICON[group.kind]} className="h-3.5 w-3.5" />
                    <span id={headingId} className="font-medium tracking-wide uppercase">
                      {t(`search.kinds.${group.kind}`)}
                    </span>
                    <span className="ml-auto flex items-center gap-3">
                      {group.more && scope === "all" && (
                        <button
                          type="button"
                          onClick={() => {
                            setScope(group.kind);
                            input.current?.focus();
                          }}
                          className="text-accent hover:underline"
                        >
                          {t("search.more")}
                        </button>
                      )}
                      {inList !== undefined && (
                        <Link
                          {...inList}
                          onClick={() => {
                            onClose(false);
                          }}
                          className="text-accent hover:underline"
                        >
                          {t("search.openList")}
                        </Link>
                      )}
                    </span>
                  </div>
                  {group.error && (
                    <p className="px-3 py-1 text-state-down">■ {t("search.kindError")}</p>
                  )}
                  {group.hits.map((hit) => {
                    const option: Option = { type: "hit", key: hit.key, hit };
                    const at = options.findIndex((o) => o.type === "hit" && o.key === hit.key);
                    return (
                      <div key={hit.key} {...optionProps(option, at)}>
                        <ObjectIcon kind={KIND_ICON[hit.kind]} className="h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="truncate font-medium">
                              <Highlight text={hit.label} query={trimmed} />
                            </span>
                            {hit.ref !== undefined && (
                              <code className="shrink-0 text-data text-ink-muted">{hit.ref}</code>
                            )}
                          </div>
                          {hit.context.length > 0 && (
                            <div className="truncate text-data text-ink-muted">
                              <Highlight text={hit.context.join(" · ")} query={trimmed} />
                            </div>
                          )}
                        </div>
                        {hit.state !== undefined && (
                          <StatusBadge state={hit.state.state} label={hit.state.label} />
                        )}
                        {"list" in hit.target && (
                          <span className="shrink-0 text-data text-ink-muted">
                            {t("search.opensList")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {group.more && scope !== "all" && (
                    <p className="px-3 py-1 text-data text-ink-muted">{t("search.refine")}</p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap gap-4 border-t border-line px-3 py-1.5 text-data text-ink-muted">
          <span>
            <kbd className="rounded-sm border border-line px-1">↑</kbd>{" "}
            <kbd className="rounded-sm border border-line px-1">↓</kbd> {t("search.keys.move")}
          </span>
          <span>
            <kbd className="rounded-sm border border-line px-1">↵</kbd> {t("search.keys.open")}
          </span>
          {proposing && recent.entries.length > 0 && (
            <span>
              <kbd className="rounded-sm border border-line px-1">Del</kbd>{" "}
              {t("search.keys.remove")}
            </span>
          )}
          <span>
            <kbd className="rounded-sm border border-line px-1">Esc</kbd> {t("search.keys.close")}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * A record shown recently, as an option of the palette: its icon and name, under it
 * its kind when grouped by time, on the right how long ago it was shown and, for the
 * record on display, that it is. The cross, shown with the pointer over the entry or
 * on the active one, removes it; Delete does so from the keyboard.
 */
function RecentRow({
  entry,
  kindShown,
  when,
  optionProps,
  onRemove,
}: {
  entry: HistoryEntry;
  kindShown: boolean;
  when: string;
  optionProps: Record<string, unknown>;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div {...optionProps} aria-current={entry.current ? "true" : undefined}>
      <ObjectIcon kind={entry.step.kind} className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{entry.label}</div>
        {kindShown && (
          <div className="truncate text-data text-ink-muted">{kindLabel(entry.step.kind, t)}</div>
        )}
      </div>
      {entry.current && (
        <span className="shrink-0 rounded-full border border-accent px-1.5 text-data text-ink">
          {t("search.recent.current")}
        </span>
      )}
      <span className="shrink-0 text-data text-ink-muted tabular-nums">{when}</span>
      <button
        type="button"
        // The keyboard removes it with Delete: the cross is for the pointer.
        tabIndex={-1}
        title={t("panelHistory.remove", { name: entry.label })}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="shrink-0 rounded-full p-1 text-ink-muted opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 hover:bg-surface-sunken hover:text-ink"
      >
        <CloseIcon className="h-3 w-3" />
        <span className="sr-only">{t("panelHistory.remove", { name: entry.label })}</span>
      </button>
    </div>
  );
}
