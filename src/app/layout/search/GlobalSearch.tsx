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
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
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

function SearchPalette({ onClose }: { onClose: (restoreFocus: boolean) => void }) {
  const { t } = useTranslation();
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

  /** Narrows the search to a kind, or widens it to all, keeping the text. */
  function setScope(next: Scope) {
    setQuery((previous) => withKindPrefix(previous, next === "all" ? undefined : next));
  }

  const groups = useMemo(
    () => (short ? [] : (search.data ?? []).filter((g) => g.hits.length > 0 || g.error)),
    [search.data, short],
  );
  const hits = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const current = hits[Math.min(active, hits.length - 1)];
  const optionId = (hit: SearchHit) => `${id}-${hit.key}`;

  useEffect(() => {
    input.current?.focus();
  }, []);

  // A new result list starts on its first result.
  useEffect(() => {
    setActive(0);
  }, [search.data, scope]);

  useEffect(() => {
    if (current === undefined) return;
    document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
    // optionId only depends on the stable useId prefix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function choose(hit: SearchHit) {
    onClose(false);
    if ("peek" in hit.target) peek(hit.target.peek.kind, hit.target.peek.id);
    else void navigate(hit.target.list);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onClose(true);
        return;
      case "ArrowDown":
      case "ArrowUp": {
        if (hits.length === 0) return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((index) => (Math.min(index, hits.length - 1) + step + hits.length) % hits.length);
        return;
      }
      case "Enter":
        if (event.target !== input.current || current === undefined) return;
        event.preventDefault();
        choose(current);
        return;
      case "Tab": {
        // The palette is modal: the focus stays inside it.
        const focusable = dialog.current?.querySelectorAll<HTMLElement>(
          "input, button:not([disabled]), a[href]",
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
            aria-expanded={hits.length > 0}
            aria-controls={`${id}-results`}
            aria-autocomplete="list"
            aria-activedescendant={current === undefined ? undefined : optionId(current)}
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
          {short ? (
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
                    const selected = hit === current;
                    return (
                      <div
                        key={hit.key}
                        id={optionId(hit)}
                        role="option"
                        aria-selected={selected}
                        onPointerMove={() => {
                          const index = hits.indexOf(hit);
                          if (index !== active) setActive(index);
                        }}
                        onClick={() => {
                          choose(hit);
                        }}
                        className={`mx-1 flex cursor-pointer items-center gap-3 rounded-(--radius-control) px-2 py-1.5 ${
                          selected ? "bg-accent-soft" : ""
                        }`}
                      >
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
          <span>
            <kbd className="rounded-sm border border-line px-1">Esc</kbd> {t("search.keys.close")}
          </span>
        </div>
      </div>
    </div>
  );
}
