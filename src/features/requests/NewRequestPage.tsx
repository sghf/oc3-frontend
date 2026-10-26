import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { useRequestFormsPref } from "@/lib/user-prefs";
import { copyText } from "@/lib/clipboard";
import { LegacyCssIcon } from "@/components/opensvc/LegacyCssIcon";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import {
  CaretRightIcon,
  CloseIcon,
  ColumnsIcon,
  FolderIcon,
  HistoryIcon,
  PuzzleIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { parseDefinition } from "@/features/forms/form-engine";
import { FormRender } from "@/features/forms/FormRender";
import { useFormUser } from "@/features/forms/use-form-user";
import { RequestResults } from "./RequestResults";
import {
  catalogGroups,
  catalogTree,
  folderDefinitions,
  type CatalogEntry,
  type CatalogForm,
  type CatalogNode,
  type CatalogView,
  type RequestSearch,
} from "./catalog";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The forms the user may submit: those published to one of their groups. */
function useCatalog() {
  return useQuery({
    queryKey: ["forms", "catalog"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CatalogForm[]> => {
      const { data, error } = await api.GET("/forms", {
        params: {
          query: {
            props: "id,form_name,form_type,form_folder,form_definition",
            limit: 0,
            meta: "0",
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      return rows.flatMap((row) =>
        row.id === undefined
          ? []
          : [
              {
                id: row.id,
                name: row.form_name ?? "",
                type: row.form_type ?? "",
                folder: row.form_folder ?? "/",
                definition: isRecord(row.form_definition) ? row.form_definition : null,
              },
            ],
      );
    },
  });
}

/** How the forms are laid out: cards, or one line each. */
type Layout = "grid" | "list";

const LAYOUT_KEY = "oc3.requests.layout";

/** The layout is a comfort of the browser, as the folded menu: kept there. */
function readLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

/** An entry with the folder it lives in, for the lists mixing folders. */
interface PlacedEntry {
  entry: CatalogEntry;
  folder: string;
}

/** The folder of a path in the tree, if any. */
function findNode(nodes: CatalogNode[], path: string): CatalogNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (path.startsWith(node.path + "/")) return findNode(node.children, path);
  }
  return undefined;
}

/** The paths from the root down to a folder: "/a", "/a/b" for "/a/b". */
function ancestors(path: string): string[] {
  const parts = path.split("/").filter((p) => p !== "");
  return parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"));
}

/**
 * New request: the catalog of the forms the user may submit, as a service desk.
 * On the left, the views (favorites, recent, all forms) and the tree of folders;
 * on the right, the forms of the selection, then the form chosen, filled in place
 * while the tree stays. The selection and the form live in the URL. The search,
 * over the whole catalog, lists its matches with their folder, the tree marking
 * the folders holding some.
 */
export function NewRequestPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/requests" });
  const navigate = useNavigate({ from: "/requests" });
  const catalog = useCatalog();
  const prefs = useRequestFormsPref();
  // The search lives in the page, not the URL: it is kept while a form is open
  // and the page is not left, and dropped otherwise.
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<Layout>(readLayout);
  // On a narrow screen, the navigation folds above the forms.
  const [browseOpen, setBrowseOpen] = useState(false);

  const forms = useMemo(() => catalog.data ?? [], [catalog.data]);
  const groups = useMemo(() => catalogGroups(forms, ""), [forms]);
  const matches = useMemo(() => catalogGroups(forms, query), [forms, query]);
  const definitions = useMemo(() => folderDefinitions(forms), [forms]);
  const tree = useMemo(() => catalogTree(groups, definitions), [groups, definitions]);
  const searching = query.trim() !== "";

  const placed = useMemo(
    () => groups.flatMap((g) => g.entries.map((entry) => ({ entry, folder: g.folder }))),
    [groups],
  );
  const byId = useMemo(() => new Map(placed.map((p) => [p.entry.form.id, p])), [placed]);
  // The number of matches of the search in each folder, its subfolders included.
  const matchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of matches) {
      for (const path of g.folder === "/" ? [] : ancestors(g.folder)) {
        counts.set(path, (counts.get(path) ?? 0) + g.entries.length);
      }
    }
    return counts;
  }, [matches]);

  const selectedForm = forms.find((f) => String(f.id) === search.form);
  const folderNode =
    search.folder === undefined ? undefined : findNode(tree.folders, search.folder);

  // The folders unfolded in the tree: the user's, and those leading to the folder
  // on display.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const shownFolder =
    search.folder ?? (selectedForm === undefined ? undefined : byId.get(selectedForm.id)?.folder);
  const isOpen = (path: string) =>
    opened.has(path) || (shownFolder !== undefined && shownFolder.startsWith(path + "/"));
  const toggle = (path: string) => {
    setOpened((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  function go(next: RequestSearch) {
    setBrowseOpen(false);
    void navigate({ search: next });
  }
  const openFolder = (path: string) => {
    setQuery("");
    go({ folder: path });
  };
  const openView = (next: CatalogView) => {
    setQuery("");
    go({ view: next });
  };
  // A form opens with the selection it was chosen from, which closing it gives back.
  const openForm = (entry: CatalogEntry) => {
    go({ folder: search.folder, view: search.view, form: String(entry.form.id) });
  };
  const closeForm = () => {
    go({ folder: search.folder, view: search.view });
  };

  const picked = (ids: number[]) => ids.flatMap((id) => byId.get(id) ?? []);
  // Without a view or a folder in the URL: the favorites when the user has some
  // still available, every form otherwise, decided once the preferences are read.
  const defaulted = search.view === undefined && search.folder === undefined;
  const view: CatalogView | undefined = !defaulted
    ? search.view
    : picked(prefs.favorites).length > 0
      ? "favorites"
      : "all";
  const deciding = defaulted && !prefs.isLoaded;
  const scopeLabel = searching
    ? t("requests.searchResults")
    : view === "favorites"
      ? t("requests.views.favorites")
      : view === "recent"
        ? t("requests.views.recent")
        : folderNode !== undefined
          ? folderNode.label || folderNode.name
          : t("requests.views.all");

  return (
    <section>
      <h1 className="mb-1 flex items-center gap-2 text-title font-semibold">
        <ObjectIcon kind="form" className="h-5 w-5" />
        {t("requests.title")}
      </h1>
      <p className="mb-4 max-w-3xl text-ink-muted">{t("requests.intro")}</p>

      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)] md:items-start">
        <button
          type="button"
          aria-expanded={browseOpen}
          onClick={() => {
            setBrowseOpen(!browseOpen);
          }}
          className="flex h-8 items-center gap-1.5 rounded-(--radius-control) border border-line px-2 text-left md:hidden"
        >
          <CaretRightIcon
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 transition-transform ${browseOpen ? "rotate-90" : ""}`}
          />
          {t("requests.browse", { name: scopeLabel })}
        </button>
        <nav
          aria-label={t("requests.navigation")}
          className={`flex-col gap-3 md:sticky md:top-4 md:flex ${browseOpen ? "flex" : "hidden"}`}
        >
          <div className="flex h-8 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder={t("requests.search")}
              aria-label={t("requests.search")}
              className="w-full bg-transparent text-ink outline-none placeholder:text-ink-muted"
            />
          </div>
          <ul className="flex flex-col gap-0.5">
            <NavItem
              current={!searching && view === "favorites" && search.form === undefined}
              icon={
                <span aria-hidden="true" className="w-4 text-center text-state-warn">
                  ★
                </span>
              }
              label={t("requests.views.favorites")}
              count={picked(prefs.favorites).length}
              onClick={() => {
                openView("favorites");
              }}
            />
            <NavItem
              current={!searching && view === "recent" && search.form === undefined}
              icon={<HistoryIcon className="h-4 w-4 shrink-0 text-ink-muted" />}
              label={t("requests.views.recent")}
              count={picked(prefs.recent).length}
              onClick={() => {
                openView("recent");
              }}
            />
            <NavItem
              current={!searching && view === "all" && search.form === undefined}
              icon={<ColumnsIcon className="h-4 w-4 shrink-0 text-ink-muted" />}
              label={t("requests.views.all")}
              count={placed.length}
              onClick={() => {
                openView("all");
              }}
            />
          </ul>
          {tree.folders.length > 0 && (
            <div className="border-t border-line pt-2">
              <h2 className="mb-1 px-1 text-data font-medium tracking-wide text-ink-muted uppercase">
                {t("requests.folders")}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {tree.folders.map((node) => (
                  <FolderItem
                    key={node.path}
                    node={node}
                    depth={0}
                    current={searching ? undefined : search.folder}
                    matchCounts={searching ? matchCounts : undefined}
                    isOpen={isOpen}
                    onToggle={toggle}
                    onOpen={openFolder}
                  />
                ))}
              </ul>
            </div>
          )}
        </nav>

        <div className="min-w-0">
          {(catalog.isPending || deciding) && <p className="text-ink-muted">{t("list.loading")}</p>}
          {catalog.isError && <p className="text-state-down">■ {catalog.error.message}</p>}
          {catalog.isSuccess &&
            !deciding &&
            (search.form !== undefined ? (
              <RequestForm
                form={selectedForm}
                folder={selectedForm === undefined ? undefined : byId.get(selectedForm.id)?.folder}
                tree={tree.folders}
                onClose={closeForm}
                onOpenFolder={openFolder}
                onSubmitted={(id) => {
                  prefs.addRecent(id);
                }}
                isFavorite={prefs.isFavorite}
                onToggleFavorite={prefs.toggleFavorite}
              />
            ) : (
              <CatalogPane
                title={scopeLabel}
                header={
                  !searching && folderNode !== undefined ? (
                    <Breadcrumb path={folderNode.path} tree={tree.folders} onOpen={openFolder} />
                  ) : undefined
                }
                desc={!searching && folderNode !== undefined ? folderNode.desc : ""}
                subfolders={!searching && folderNode !== undefined ? folderNode.children : []}
                onOpenFolder={openFolder}
                entries={
                  searching
                    ? matches.flatMap((g) =>
                        g.entries.map((entry) => ({ entry, folder: g.folder })),
                      )
                    : view === "favorites"
                      ? picked(prefs.favorites)
                      : view === "recent"
                        ? picked(prefs.recent)
                        : folderNode !== undefined
                          ? folderNode.entries.map((entry) => ({ entry, folder: folderNode.path }))
                          : search.folder !== undefined
                            ? []
                            : placed
                }
                // The folder is said when the list mixes them.
                showFolder={searching || view !== undefined || search.folder === undefined}
                empty={
                  searching
                    ? t("requests.noMatch")
                    : view === "favorites"
                      ? t("requests.noFavorites")
                      : view === "recent"
                        ? t("requests.noRecent")
                        : search.folder !== undefined && folderNode === undefined
                          ? t("requests.folderNotFound")
                          : t("requests.empty")
                }
                layout={layout}
                onLayout={(next) => {
                  setLayout(next);
                  try {
                    localStorage.setItem(LAYOUT_KEY, next);
                  } catch {
                    // Not remembered: the choice holds until the page is reloaded.
                  }
                }}
                onOpen={openForm}
                isFavorite={prefs.isFavorite}
                onToggleFavorite={prefs.toggleFavorite}
              />
            ))}
        </div>
      </div>
    </section>
  );
}

/** An entry of the views of the navigation. */
function NavItem({
  current,
  icon,
  label,
  count,
  onClick,
}: {
  current: boolean;
  icon: ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={current ? "page" : undefined}
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-(--radius-control) px-2 py-1 text-left text-ink hover:bg-surface-sunken aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium"
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-data text-ink-muted tabular-nums">{count}</span>
      </button>
    </li>
  );
}

/**
 * A folder of the navigation tree: its caret folds or unfolds it, its name opens
 * it. Its icon is the one its "folder" form defines (FolderCss), the folder icon
 * otherwise. While searching, the number of its matches stands for its size, and a
 * folder without any fades.
 */
function FolderItem({
  node,
  depth,
  current,
  matchCounts,
  isOpen,
  onToggle,
  onOpen,
}: {
  node: CatalogNode;
  depth: number;
  current: string | undefined;
  matchCounts: Map<string, number> | undefined;
  isOpen: (path: string) => boolean;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  const { t } = useTranslation();
  const open = isOpen(node.path);
  const matched = matchCounts?.get(node.path) ?? 0;
  const faded = matchCounts !== undefined && matched === 0;
  return (
    <li>
      <div
        className={`flex items-center rounded-(--radius-control) ${
          current === node.path ? "bg-accent-soft font-medium" : "hover:bg-surface-sunken"
        } ${faded ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${String(depth * 0.75)}rem` }}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={t(open ? "requests.foldFolder" : "requests.unfoldFolder", {
              name: node.label || node.name,
            })}
            onClick={() => {
              onToggle(node.path);
            }}
            className="flex h-7 w-5 shrink-0 items-center justify-center text-ink-muted hover:text-ink"
          >
            <CaretRightIcon
              aria-hidden="true"
              className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          aria-current={current === node.path ? "page" : undefined}
          onClick={() => {
            onOpen(node.path);
          }}
          title={node.path}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-ink"
        >
          <LegacyCssIcon
            css={node.css}
            fallback={<FolderIcon className="h-4 w-4 shrink-0 text-ink-muted" />}
          />
          <span className="min-w-0 flex-1 truncate">{node.label || node.name}</span>
          <span
            className={`text-data tabular-nums ${matchCounts !== undefined && matched > 0 ? "font-semibold text-accent" : "text-ink-muted"}`}
          >
            {matchCounts === undefined ? node.count : matched}
          </span>
        </button>
      </div>
      {open && node.children.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {node.children.map((child) => (
            <FolderItem
              key={child.path}
              node={child}
              depth={depth + 1}
              current={current}
              matchCounts={matchCounts}
              isOpen={isOpen}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The path of a folder, each part opening its folder. */
function Breadcrumb({
  path,
  tree,
  onOpen,
  last,
}: {
  path: string;
  tree: CatalogNode[];
  onOpen: (path: string) => void;
  /** What follows the folder, the form open in it. */
  last?: string;
}) {
  const { t } = useTranslation();
  const parts = ancestors(path);
  return (
    <nav aria-label={t("requests.breadcrumb")} className="mb-1 text-data text-ink-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {parts.map((p, i) => {
          const node = findNode(tree, p);
          const name = node?.label || node?.name || p;
          const isLast = i === parts.length - 1 && last === undefined;
          return (
            <li key={p} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true">›</span>}
              {isLast ? (
                <span aria-current="page">{name}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onOpen(p);
                  }}
                  className="hover:text-ink hover:underline"
                >
                  {name}
                </button>
              )}
            </li>
          );
        })}
        {last !== undefined && (
          <li className="flex items-center gap-1">
            <span aria-hidden="true">›</span>
            <span aria-current="page">{last}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}

/** The right pane before a form is chosen: the forms of the selection. */
function CatalogPane({
  title,
  header,
  desc,
  subfolders,
  onOpenFolder,
  entries,
  showFolder,
  empty,
  layout,
  onLayout,
  onOpen,
  isFavorite,
  onToggleFavorite,
}: {
  title: string;
  header?: ReactNode;
  desc: string;
  subfolders: CatalogNode[];
  onOpenFolder: (path: string) => void;
  entries: PlacedEntry[];
  showFolder: boolean;
  empty: string;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onOpen: (entry: CatalogEntry) => void;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      {header}
      <div className="mb-3 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold">
            {title}{" "}
            <span className="text-data font-normal text-ink-muted">
              {t("requests.folderCount", { count: entries.length })}
            </span>
          </h2>
          {desc !== "" && <p className="mt-1 max-w-3xl text-ink-muted">{desc}</p>}
        </div>
        <div role="group" aria-label={t("requests.layout")} className="flex gap-1">
          {(["grid", "list"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={layout === choice}
              onClick={() => {
                onLayout(choice);
              }}
              className="h-7 rounded-full border border-line px-2.5 text-ink-muted hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-ink"
            >
              {t(`requests.layouts.${choice}`)}
            </button>
          ))}
        </div>
      </div>
      {subfolders.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {subfolders.map((child) => (
            <li key={child.path}>
              <button
                type="button"
                onClick={() => {
                  onOpenFolder(child.path);
                }}
                className="flex items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2.5 py-1 hover:border-line-strong hover:bg-surface-sunken"
              >
                <LegacyCssIcon
                  css={child.css}
                  fallback={<FolderIcon className="h-4 w-4 shrink-0 text-ink-muted" />}
                />
                {child.label || child.name}
                <span className="text-data text-ink-muted tabular-nums">{child.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {entries.length === 0 ? (
        <p className="text-ink-muted">{empty}</p>
      ) : (
        <ul
          className={
            layout === "grid"
              ? "grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2"
              : "flex flex-col divide-y divide-line rounded-(--radius-panel) border border-line bg-surface-raised"
          }
        >
          {entries.map(({ entry, folder }) => (
            <li key={entry.key}>
              <CatalogCard
                entry={entry}
                folder={showFolder && folder !== "/" ? folder : undefined}
                layout={layout}
                onOpen={() => {
                  onOpen(entry);
                }}
                favorite={isFavorite(entry.form.id)}
                onToggleFavorite={() => {
                  onToggleFavorite(entry.form.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The star adding a form to the favorites, or removing it. */
function FavoriteToggle({
  favorite,
  name,
  onToggle,
  className = "",
}: {
  favorite: boolean;
  name: string;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t(favorite ? "requests.unfavorite" : "requests.favorite", { name });
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-control) hover:bg-surface-sunken ${
        favorite ? "text-state-warn" : "text-ink-muted hover:text-ink"
      } ${className}`}
    >
      <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
    </button>
  );
}

/**
 * A form of the catalog, as a compact card or a line: its icon (Css, the workflow
 * puzzle by default), its label, two lines of description, where its data goes,
 * the folder it lives in when the list mixes folders, and its favorite star.
 */
function CatalogCard({
  entry,
  folder,
  layout,
  onOpen,
  favorite,
  onToggleFavorite,
}: {
  entry: CatalogEntry;
  folder: string | undefined;
  layout: Layout;
  onOpen: () => void;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const grid = layout === "grid";
  return (
    <div
      className={`relative flex h-full ${grid ? "rounded-(--radius-panel) border border-line bg-surface-raised hover:border-line-strong" : ""}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className={`flex min-w-0 flex-1 gap-2.5 py-2.5 pr-9 pl-3 text-left hover:bg-surface-sunken ${
          grid ? "items-start rounded-(--radius-panel)" : "items-center"
        }`}
      >
        <span className={grid ? "mt-0.5 shrink-0" : "shrink-0"}>
          <LegacyCssIcon
            css={entry.css}
            className="h-5 w-5"
            fallback={<PuzzleIcon className="h-5 w-5 text-icon-form" />}
          />
        </span>
        <span className={`min-w-0 ${grid ? "" : "flex flex-1 items-baseline gap-3"}`}>
          <span className={`block font-medium text-ink ${grid ? "" : "shrink-0"}`}>
            {entry.label}
          </span>
          {entry.desc !== "" && (
            <span
              className={`text-ink-muted ${grid ? "mt-0.5 line-clamp-2" : "min-w-0 flex-1 truncate"}`}
            >
              {entry.desc}
            </span>
          )}
          <span className={`flex flex-wrap items-center gap-1.5 ${grid ? "mt-1.5" : "shrink-0"}`}>
            {entry.dest !== "" && (
              <span className="rounded-full bg-surface-sunken px-1.5 text-data text-ink-muted">
                {entry.dest}
              </span>
            )}
            {folder !== undefined && (
              <span className="flex items-center gap-1 font-mono text-data text-ink-muted">
                <FolderIcon className="h-3 w-3" />
                {folder}
              </span>
            )}
          </span>
        </span>
      </button>
      <FavoriteToggle
        favorite={favorite}
        name={entry.label}
        onToggle={onToggleFavorite}
        className={`absolute right-1 ${grid ? "top-1.5" : "top-1/2 -translate-y-1/2"}`}
      />
    </div>
  );
}

/** The workflow a submission created, if any: its id, from the results. */
function createdWorkflowId(results: unknown): number | null {
  if (!isRecord(results) || !isRecord(results.outputs)) return null;
  for (const output of Object.values(results.outputs)) {
    if (isRecord(output) && typeof output.workflow_id === "number") return output.workflow_id;
  }
  return null;
}

/**
 * The confirmation of a submission that created a request: its number, who it now
 * awaits, and where to follow it.
 */
function RequestCreated({ workflowId, onNew }: { workflowId: number; onNew: () => void }) {
  const { t } = useTranslation();
  const workflow = useQuery({
    queryKey: ["workflows", "created", workflowId],
    queryFn: async () => {
      const { data, error } = await api.GET("/workflows", {
        params: {
          query: { props: "id,status,last_assignee", filter: [`id:${String(workflowId)}`] },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      return (rows[0] as Record<string, unknown> | undefined) ?? null;
    },
  });
  const assignee =
    typeof workflow.data?.last_assignee === "string" ? workflow.data.last_assignee.trim() : "";
  return (
    <div className="rounded-(--radius-panel) border border-line bg-surface-raised p-4">
      <p role="status" className="text-title font-semibold text-state-up">
        ● {t("requests.created.title", { id: workflowId })}
      </p>
      {assignee !== "" && (
        <p className="mt-1 text-ink-muted">{t("requests.created.awaiting", { assignee })}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/requests/all"
          search={{ sel: String(workflowId) }}
          className="flex h-8 items-center rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
        >
          {t("requests.created.view")}
        </Link>
        <Link
          to="/requests/all"
          className="flex h-8 items-center rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
        >
          {t("requests.created.all")}
        </Link>
        <button
          type="button"
          onClick={onNew}
          className="h-8 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
        >
          {t("requests.created.new")}
        </button>
      </div>
    </div>
  );
}

/**
 * The chosen form, filled in place of the forms of the selection, the tree staying
 * on the left: its path, its favorite star, and the submit button kept in sight at
 * the bottom of the screen. Once submitted, the form gives way to the outcome: the
 * request created and where to follow it, then the progress of the outputs.
 */
function RequestForm({
  form,
  folder,
  tree,
  onClose,
  onOpenFolder,
  onSubmitted,
  isFavorite,
  onToggleFavorite,
}: {
  form: CatalogForm | undefined;
  folder: string | undefined;
  tree: CatalogNode[];
  onClose: () => void;
  onOpenFolder: (path: string) => void;
  onSubmitted: (formId: number) => void;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (id: number) => void;
}) {
  const { t } = useTranslation();
  const user = useFormUser();
  const def = useMemo(() => parseDefinition(form?.definition), [form]);
  // What a submission would send, as the form reports it on every change.
  const [payload, setPayload] = useState<unknown>(undefined);
  useEffect(() => {
    setPayload(undefined);
  }, [form?.id]);
  const submit = useMutation({
    mutationFn: async (data: unknown) => {
      const { data: results, error } = await api.PUT("/forms/{form_id}", {
        params: { path: { form_id: form?.id ?? 0 } },
        body: { data },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return results as unknown;
    },
    onSuccess: () => {
      if (form !== undefined) onSubmitted(form.id);
    },
  });
  // Another form opened from the tree: the outcome of the previous one goes.
  const reset = submit.reset;
  useEffect(() => {
    reset();
  }, [form?.id, reset]);
  const resultsId =
    isRecord(submit.data) && typeof submit.data.results_id === "number"
      ? submit.data.results_id
      : null;
  const workflowId = createdWorkflowId(submit.data);
  const title = def?.label || form?.name || "";

  if (user.isPending) return <p className="text-ink-muted">{t("list.loading")}</p>;
  return (
    <div>
      {folder !== undefined && folder !== "/" && (
        <Breadcrumb path={folder} tree={tree} onOpen={onOpenFolder} last={title} />
      )}
      {form === undefined ? (
        <p className="text-state-down">■ {t("requests.notFound")}</p>
      ) : user.isError ? (
        <p className="text-state-down">■ {user.error.message}</p>
      ) : def === null || def.output === null ? (
        <p className="text-ink-muted">{t("requests.unusable")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-(--radius-panel) border border-line bg-surface-raised p-4">
            <div className="mb-1 flex items-start gap-2">
              <h2 className="flex min-w-0 flex-1 items-center gap-2 text-title font-semibold text-ink">
                <LegacyCssIcon
                  css={def.css}
                  className="h-5 w-5"
                  fallback={<PuzzleIcon className="h-5 w-5 text-icon-form" />}
                />
                {title}
              </h2>
              <FavoriteToggle
                favorite={isFavorite(form.id)}
                name={title}
                onToggle={() => {
                  onToggleFavorite(form.id);
                }}
              />
              <button
                type="button"
                onClick={onClose}
                aria-label={t("requests.close")}
                title={t("requests.close")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-control) text-ink-muted hover:bg-surface-sunken hover:text-ink"
              >
                <CloseIcon />
              </button>
            </div>
            {def.desc !== "" && (
              <p className="mb-4 whitespace-pre-line text-ink-muted">{def.desc}</p>
            )}
            {resultsId === null ? (
              <FormRender
                key={form.id}
                formId={form.id}
                def={def}
                user={user.data}
                onSubmit={(data) => {
                  submit.mutate(data);
                }}
                onDataChange={setPayload}
                submitLabel={submit.isPending ? t("requests.submitting") : t("requests.submit")}
                stickySubmit
                secondaryAction={
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
                  >
                    {t("requests.cancel")}
                  </button>
                }
              />
            ) : workflowId !== null ? (
              <RequestCreated workflowId={workflowId} onNew={onClose} />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p role="status" className="font-medium text-ink">
                  {t("requests.submitted")}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
                >
                  {t("requests.created.new")}
                </button>
              </div>
            )}
            {resultsId === null && <PayloadPreview formId={form.id} data={payload} />}
            {submit.isError && (
              <p role="alert" className="mt-3 text-state-down">
                ■ {submit.error.message}
              </p>
            )}
          </div>
          {resultsId !== null && (
            <RequestResults key={resultsId} resultsId={resultsId} initial={submit.data} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The body a submission of the form sends to the API, as it stands, under a
 * disclosure: the call, then the JSON, copied in one click. It follows the
 * inputs as they change: an input whose condition does not hold is left out,
 * an empty one is sent empty, as on submission (`groupData`).
 */
function PayloadPreview({ formId, data }: { formId: number; data: unknown }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify({ data: data ?? {} }, null, 2);
  return (
    <details className="mt-4 rounded-(--radius-panel) border border-line bg-surface">
      <summary className="cursor-pointer px-3 py-2 text-ink-muted hover:text-ink">
        {t("requests.payload.summary")}
      </summary>
      <div className="flex flex-col gap-2 border-t border-line px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <code className="font-mono text-data text-ink-muted">
            PUT /api/forms/{String(formId)}
          </code>
          <button
            type="button"
            onClick={() => {
              void copyText(text).then(() => {
                setCopied(true);
                window.setTimeout(() => {
                  setCopied(false);
                }, 2000);
              });
            }}
            className="h-7 rounded-(--radius-control) border border-line px-2 text-ink hover:bg-surface-sunken"
          >
            <span aria-live="polite">
              {copied ? t("requests.payload.copied") : t("requests.payload.copy")}
            </span>
          </button>
        </div>
        <pre className="max-h-96 overflow-auto font-mono text-data break-all whitespace-pre-wrap text-ink">
          {text}
        </pre>
        <p className="text-ink-muted">{t("requests.payload.hint")}</p>
      </div>
    </details>
  );
}
