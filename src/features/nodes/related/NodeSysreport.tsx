import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CategoryCount, CategoryTabs, type CategoryTab } from "@/components/ui/CategoryTabs";
import { UnifiedDiff } from "@/components/ui/UnifiedDiff";
import { copyText } from "@/lib/clipboard";
import {
  CaretRightIcon,
  ClockIcon,
  FileIcon,
  LockIcon,
  SearchIcon,
  TerminalIcon,
} from "@/components/ui/icons";
import {
  useNodeSysreport,
  useNodeSysreportChange,
  useNodeSysreportFile,
  useNodeSysreportTimediff,
  useNodeSysreportTree,
  type SysreportChange,
  type SysreportEntry,
  type SysreportFileDiff,
} from "./queries";
import { periodBegin, type Period } from "./sysreport-period";
import { SysreportPurgeForm, SysreportPurgeTracker, type PurgeTarget } from "./SysreportPurge";
import { useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { dateTimeFormat } from "@/lib/date-format";

type Mode = "changes" | "files";
type Kind = "file" | "command";

const MODES: readonly Mode[] = ["changes", "files"];
const PERIODS: readonly Period[] = ["day", "week", "month", "all"];
const KINDS: readonly Kind[] = ["file", "command"];

/** Changes shown at first, and added by "show older". */
const PAGE = 30;
/** Beyond this many files, a change opens with its files folded: a first report counts a hundred. */
const FOLD_FROM = 8;

function formatBytes(size: number, locale: string): string {
  const [value, unit] =
    size >= 1024 * 1024
      ? [size / (1024 * 1024), "megabyte"]
      : size >= 1024
        ? [size / 1024, "kilobyte"]
        : [size, "byte"];
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "narrow",
    maximumFractionDigits: 1,
  }).format(value);
}

function KindIcon({ kind }: { kind: Kind }) {
  const Icon = kind === "command" ? TerminalIcon : FileIcon;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />;
}

/** Lines added and removed, by sign as well as by tint. */
function Counts({ added, deleted }: { added: number; deleted: number }) {
  return (
    <span className="shrink-0 font-mono text-data tabular-nums">
      {added > 0 && <span className="text-state-up">+{added}</span>}
      {added > 0 && deleted > 0 && " "}
      {deleted > 0 && <span className="text-state-down">−{deleted}</span>}
    </span>
  );
}

/**
 * Sysreport of a node: the history of the files and command outputs its agent
 * reports. Two views, chosen by chips as in the Inventory tab (`CategoryTabs`,
 * the choice in the URL as `diff`):
 *
 * - Changes: the reports that changed something, newest first and grouped by day,
 *   each unfolding in place into the unified diff of every file it changed;
 * - Files: what the node reports, at the latest report or at the date of a change,
 *   each file or command unfolding in place into its content.
 *
 * The strip of chips and the filters stay in view while the list scrolls. The
 * content of a sensitive path the user may not read is withheld by the API: the
 * path is listed with a lock.
 */
export function NodeSysreport({ nodeId, locale }: { nodeId: string; locale: string }) {
  const { t } = useTranslation();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const mode = MODES.find((m) => m === search.diff) ?? "changes";

  const [path, setPath] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ file: true, command: true });
  const [limit, setLimit] = useState(PAGE);
  const [comparing, setComparing] = useState(false);
  // The revision the Files view shows: the latest report unless a change was chosen.
  const [at, setAt] = useState<{ cid: string; date: string } | null>(null);
  const [filesFilter, setFilesFilter] = useState("");
  // The purge asked from the Files view, followed here: the row it was asked
  // from leaves with the file.
  const [purge, setPurge] = useState<PurgeTarget | null>(null);
  const canPurge = useEffectivePrivileges().data?.has("Manager") === true;

  const needle = useDebounced(path.trim(), 250);
  const timeline = useNodeSysreport(nodeId, { path: needle, begin: periodBegin(period), limit });
  const tree = useNodeSysreportTree(nodeId, at?.cid ?? "HEAD");

  function select(next: Mode) {
    void navigate({
      to: ".",
      search: (previous) => ({ ...(previous as Record<string, unknown>), diff: next }),
      resetScroll: false,
    });
  }

  const tabs: CategoryTab<Mode>[] = [
    chip("changes", <ClockIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />, {
      count: timeline.data?.total,
      failed: timeline.isError,
    }),
    chip("files", <FileIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />, {
      count: tree.data?.length,
      failed: tree.isError,
    }),
  ];
  function chip(
    key: Mode,
    icon: ReactNode,
    load: { count: number | undefined; failed: boolean },
  ): CategoryTab<Mode> {
    return {
      key,
      label: t(`nodes.sysreport.modes.${key}`),
      icon,
      tone: load.failed ? "error" : "muted",
      description: load.failed
        ? t("nodes.sysreport.chip.error")
        : load.count === undefined
          ? t("nodes.sysreport.chip.pending")
          : t(`nodes.sysreport.chip.${key}`, { count: load.count }),
      mark: load.failed ? (
        <span aria-hidden="true">■</span>
      ) : load.count === undefined ? (
        <span aria-hidden="true">…</span>
      ) : (
        <CategoryCount count={load.count} />
      ),
    };
  }

  const INPUT =
    "flex h-8 w-64 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted";

  return (
    <div className="flex flex-col gap-2">
      <div
        // Covers the panel padding, so that the rows scrolling under it stay hidden.
        className="sticky -top-3 z-10 -mx-3 -mt-3 flex flex-col gap-2 border-b border-line bg-surface-raised px-3 pt-3 pb-2"
      >
        <CategoryTabs
          label={t("nodes.sysreport.modesLabel")}
          idPrefix="sysreport"
          tabs={tabs}
          active={mode}
          onSelect={select}
        />
        {mode === "changes" ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className={INPUT}>
              <SearchIcon />
              <input
                type="search"
                value={path}
                onChange={(event) => {
                  setPath(event.target.value);
                  setLimit(PAGE);
                }}
                placeholder={t("nodes.sysreport.search")}
                aria-label={t("nodes.sysreport.search")}
                className="w-full bg-transparent text-ink outline-none placeholder:text-ink-muted"
              />
            </div>
            <label className="flex items-center gap-1.5 text-ink-muted">
              {t("nodes.sysreport.period.label")}
              <select
                value={period}
                onChange={(event) => {
                  const next = PERIODS.find((p) => p === event.target.value);
                  if (next !== undefined) setPeriod(next);
                  setLimit(PAGE);
                }}
                className="h-8 rounded-(--radius-control) border border-line bg-surface px-1.5 text-ink"
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t(`nodes.sysreport.period.options.${p}`)}
                  </option>
                ))}
              </select>
            </label>
            <div
              role="group"
              aria-label={t("nodes.sysreport.kindsLabel")}
              className="flex items-center gap-3"
            >
              {KINDS.map((kind) => (
                <label key={kind} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={kinds[kind]}
                    onChange={(event) => {
                      setKinds({ ...kinds, [kind]: event.target.checked });
                    }}
                  />
                  <KindIcon kind={kind} />
                  {t(`nodes.sysreport.kinds.${kind}`)}
                </label>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={comparing}
              onClick={() => {
                setComparing(!comparing);
              }}
              className="ml-auto h-8 rounded-(--radius-control) border border-line px-2 hover:bg-surface-sunken aria-pressed:border-accent aria-pressed:bg-accent-soft"
            >
              {t("nodes.sysreport.compare.toggle")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className={INPUT}>
              <SearchIcon />
              <input
                type="search"
                value={filesFilter}
                onChange={(event) => {
                  setFilesFilter(event.target.value);
                }}
                placeholder={t("nodes.sysreport.files.search")}
                aria-label={t("nodes.sysreport.files.search")}
                className="w-full bg-transparent text-ink outline-none placeholder:text-ink-muted"
              />
            </div>
            <p className="text-ink-muted">
              {at === null
                ? t("nodes.sysreport.files.latest")
                : t("nodes.sysreport.files.at", { date: formatMoment(at.date) })}
            </p>
            {at !== null && (
              <button
                type="button"
                onClick={() => {
                  setAt(null);
                }}
                className="text-accent hover:underline"
              >
                {t("nodes.sysreport.files.backToLatest")}
              </button>
            )}
          </div>
        )}
      </div>

      <div role="tabpanel" id={`sysreport-panel-${mode}`} aria-labelledby={`sysreport-tab-${mode}`}>
        {mode === "changes" ? (
          <Changes
            nodeId={nodeId}
            changes={timeline.data?.changes}
            total={timeline.data?.total ?? 0}
            isPending={timeline.isPending}
            errorMessage={timeline.isError ? timeline.error.message : null}
            kinds={kinds}
            needle={needle}
            filtered={needle !== "" || period !== "all"}
            comparing={comparing}
            onMore={() => {
              setLimit(limit + PAGE);
            }}
            onBrowse={(change) => {
              setAt({ cid: change.cid, date: change.date });
              select("files");
            }}
          />
        ) : (
          <Files
            nodeId={nodeId}
            locale={locale}
            cid={at?.cid ?? "HEAD"}
            entries={tree.data}
            isPending={tree.isPending}
            errorMessage={tree.isError ? tree.error.message : null}
            filter={filesFilter.trim().toLowerCase()}
            onHistory={(entry) => {
              setPath(entry.path);
              setPeriod("all");
              setLimit(PAGE);
              select("changes");
            }}
            onPurgeQueued={canPurge ? setPurge : undefined}
          />
        )}
        {purge !== null && (
          <SysreportPurgeTracker
            nodeId={nodeId}
            target={purge}
            onDismiss={() => {
              setPurge(null);
            }}
          />
        )}
      </div>
    </div>
  );
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

function formatMoment(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? date
    : dateTimeFormat({ dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

/** The reports that changed something, grouped by day, each unfolding in place. */
function Changes({
  nodeId,
  changes,
  total,
  isPending,
  errorMessage,
  kinds,
  needle,
  filtered,
  comparing,
  onMore,
  onBrowse,
}: {
  nodeId: string;
  changes: SysreportChange[] | undefined;
  total: number;
  isPending: boolean;
  errorMessage: string | null;
  kinds: Record<Kind, boolean>;
  needle: string;
  filtered: boolean;
  /** True while two reports are being picked to compare the node between them. */
  comparing: boolean;
  onMore: () => void;
  onBrowse: (change: SysreportChange) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // The reports picked for a comparison, two at most: a third replaces the oldest pick.
  const [picked, setPicked] = useState<SysreportChange[]>([]);

  if (isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (errorMessage !== null)
    return (
      <p role="alert" className="text-state-down">
        ■ {t("detail.error", { message: errorMessage })}
      </p>
    );

  // The kinds unchecked are left out of each change, and a change left empty with them.
  const shown = (changes ?? [])
    .map((change) => ({ change, files: change.files.filter((file) => kinds[file.kind]) }))
    .filter((entry) => entry.files.length > 0);
  if (shown.length === 0)
    return (
      <p className="text-ink-muted">
        {filtered || !kinds.file || !kinds.command
          ? t("nodes.sysreport.emptyFiltered")
          : t("nodes.sysreport.empty")}
      </p>
    );

  const day = dateTimeFormat({ dateStyle: "full" });
  const time = dateTimeFormat({ timeStyle: "short" });
  const moment = dateTimeFormat({ dateStyle: "medium", timeStyle: "short" });
  const days: { label: string; entries: typeof shown }[] = [];
  for (const entry of shown) {
    const label = day.format(new Date(entry.change.date));
    const last = days[days.length - 1];
    if (last !== undefined && last.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  }

  return (
    <div className="flex flex-col gap-3">
      {comparing && (
        <Comparison
          nodeId={nodeId}
          picked={picked}
          kinds={kinds}
          needle={needle}
          onClear={() => {
            setPicked([]);
          }}
        />
      )}
      {days.map((group) => (
        <section key={group.label}>
          <h3 className="mb-1 font-semibold text-ink-muted">{group.label}</h3>
          <ul className="flex flex-col divide-y divide-line rounded-(--radius-control) border border-line">
            {group.entries.map(({ change, files }) => {
              const expanded = open.has(change.cid);
              const added = files.reduce((sum, file) => sum + file.added, 0);
              const deleted = files.reduce((sum, file) => sum + file.deleted, 0);
              return (
                <li key={change.cid}>
                  <div className="flex items-center">
                    {comparing && (
                      <input
                        type="checkbox"
                        className="ml-2 shrink-0"
                        aria-label={t("nodes.sysreport.compare.pick", {
                          date: moment.format(new Date(change.date)),
                        })}
                        checked={picked.some((p) => p.cid === change.cid)}
                        onChange={(event) => {
                          setPicked(
                            event.target.checked
                              ? [...picked, change].slice(-2)
                              : picked.filter((p) => p.cid !== change.cid),
                          );
                        }}
                      />
                    )}
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => {
                        const next = new Set(open);
                        if (expanded) next.delete(change.cid);
                        else next.add(change.cid);
                        setOpen(next);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-left hover:bg-surface-sunken"
                    >
                      <CaretRightIcon
                        className={`h-3 w-3 shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                      <span className="w-16 shrink-0 font-medium whitespace-nowrap tabular-nums">
                        {time.format(new Date(change.date))}
                      </span>
                      <span className="shrink-0 text-ink-muted">
                        {t("nodes.sysreport.change.files", { count: files.length })}
                      </span>
                      <Counts added={added} deleted={deleted} />
                      {change.initial && (
                        <span className="shrink-0 rounded-full border border-line px-1.5 text-data text-ink-muted">
                          {t("nodes.sysreport.change.initial")}
                        </span>
                      )}
                      {/* A glimpse of what changed, before unfolding. */}
                      <span className="min-w-0 flex-1 truncate font-mono text-data text-ink-muted">
                        {files
                          .slice(0, 3)
                          .map((file) => file.path)
                          .join("   ")}
                      </span>
                    </button>
                  </div>
                  {expanded && (
                    <ChangeDetail
                      nodeId={nodeId}
                      change={change}
                      kinds={kinds}
                      needle={needle}
                      onBrowse={() => {
                        onBrowse(change);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {changes !== undefined && changes.length < total && (
        <div className="flex items-center gap-3">
          <span className="text-ink-muted tabular-nums">
            {t("nodes.sysreport.shown", { shown: changes.length, total })}
          </span>
          <button
            type="button"
            onClick={onMore}
            className="h-7 rounded-(--radius-control) border border-line px-2 hover:bg-surface-sunken"
          >
            {t("nodes.sysreport.older")}
          </button>
        </div>
      )}
    </div>
  );
}

/** What a report changed: one foldable block per file, with its unified diff. */
function ChangeDetail({
  nodeId,
  change,
  kinds,
  needle,
  onBrowse,
}: {
  nodeId: string;
  change: SysreportChange;
  kinds: Record<Kind, boolean>;
  needle: string;
  onBrowse: () => void;
}) {
  const { t } = useTranslation();
  const detail = useNodeSysreportChange(nodeId, change.cid, true);

  if (detail.isPending) return <p className="px-7 py-2 text-ink-muted">{t("detail.loading")}</p>;
  if (detail.isError)
    return (
      <p role="alert" className="px-7 py-2 text-state-down">
        ■ {t("detail.error", { message: detail.error.message })}
      </p>
    );

  const lower = needle.toLowerCase();
  const files = detail.data.files.filter(
    (file) => kinds[file.kind] && (lower === "" || file.path.toLowerCase().includes(lower)),
  );
  return (
    <div className="flex flex-col gap-2 border-t border-line bg-surface px-2 py-2 pl-7">
      <div className="flex flex-wrap items-center gap-3 text-ink-muted">
        {files.length < detail.data.files.length && (
          <span>
            {t("nodes.sysreport.change.partial", {
              shown: files.length,
              total: detail.data.files.length,
            })}
          </span>
        )}
        <button type="button" onClick={onBrowse} className="ml-auto text-accent hover:underline">
          {t("nodes.sysreport.change.browse")}
        </button>
      </div>
      <FileDiffList files={files} />
    </div>
  );
}

/**
 * The files of a change, one foldable block each. Few files: unfolded, to read the
 * change at once. Many: folded, to find one's way.
 */
function FileDiffList({ files }: { files: SysreportFileDiff[] }) {
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const foldedByDefault = files.length > FOLD_FROM;
  return (
    <>
      {files.map((file) => {
        const unfolded = toggled.has(file.path) ? foldedByDefault : !foldedByDefault;
        return (
          <FileDiff
            key={`${file.kind}:${file.path}`}
            file={file}
            unfolded={unfolded}
            onToggle={() => {
              const next = new Set(toggled);
              if (next.has(file.path)) next.delete(file.path);
              else next.add(file.path);
              setToggled(next);
            }}
          />
        );
      })}
    </>
  );
}

/**
 * The node compared between two reports: what changed after the older one up to
 * the newer one, as a single diff per file. One report picked compares with the
 * latest report on request.
 */
function Comparison({
  nodeId,
  picked,
  kinds,
  needle,
  onClear,
}: {
  nodeId: string;
  picked: SysreportChange[];
  kinds: Record<Kind, boolean>;
  needle: string;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [withLatest, setWithLatest] = useState(false);
  const ordered = [...picked].sort((a, b) => a.date.localeCompare(b.date));
  const begin = ordered[0];
  const end = ordered[1];
  const ready = begin !== undefined && (end !== undefined || withLatest);

  return (
    <section
      aria-label={t("nodes.sysreport.compare.toggle")}
      className="flex flex-col gap-2 rounded-(--radius-control) border border-accent bg-surface p-2"
    >
      {begin === undefined ? (
        <p className="text-ink-muted">{t("nodes.sysreport.compare.none")}</p>
      ) : !ready ? (
        <p className="flex flex-wrap items-center gap-2 text-ink-muted">
          {t("nodes.sysreport.compare.one", { date: formatMoment(begin.date) })}
          <button
            type="button"
            onClick={() => {
              setWithLatest(true);
            }}
            className="text-accent hover:underline"
          >
            {t("nodes.sysreport.compare.withLatest")}
          </button>
        </p>
      ) : (
        <ComparisonResult
          nodeId={nodeId}
          begin={begin}
          end={end}
          kinds={kinds}
          needle={needle}
          onClear={() => {
            setWithLatest(false);
            onClear();
          }}
        />
      )}
    </section>
  );
}

function ComparisonResult({
  nodeId,
  begin,
  end,
  kinds,
  needle,
  onClear,
}: {
  nodeId: string;
  begin: SysreportChange;
  end: SysreportChange | undefined;
  kinds: Record<Kind, boolean>;
  needle: string;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const diff = useNodeSysreportTimediff(nodeId, begin.cid, end?.cid);

  if (diff.isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (diff.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {t("detail.error", { message: diff.error.message })}
      </p>
    );

  const lower = needle.toLowerCase();
  const files = diff.data.files.filter(
    (file) => kinds[file.kind] && (lower === "" || file.path.toLowerCase().includes(lower)),
  );
  const added = files.reduce((sum, file) => sum + file.added, 0);
  const deleted = files.reduce((sum, file) => sum + file.deleted, 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">
          {t("nodes.sysreport.compare.title", {
            begin: formatMoment(diff.data.begin.date),
            end: formatMoment(diff.data.end.date),
          })}
        </h3>
        <span className="text-ink-muted">
          {t("nodes.sysreport.change.files", { count: files.length })}
        </span>
        <Counts added={added} deleted={deleted} />
        <button type="button" onClick={onClear} className="ml-auto text-accent hover:underline">
          {t("nodes.sysreport.compare.clear")}
        </button>
      </div>
      <p className="text-ink-muted">{t("nodes.sysreport.compare.explain")}</p>
      {files.length === 0 ? (
        <p className="text-ink-muted">
          {diff.data.files.length === 0
            ? t("nodes.sysreport.compare.identical")
            : t("nodes.sysreport.emptyFiltered")}
        </p>
      ) : (
        <FileDiffList files={files} />
      )}
    </>
  );
}

function FileDiff({
  file,
  unfolded,
  onToggle,
}: {
  file: SysreportFileDiff;
  unfolded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-(--radius-control) border border-line bg-surface-raised">
      <button
        type="button"
        aria-expanded={unfolded}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-surface-sunken"
      >
        <CaretRightIcon
          className={`h-3 w-3 shrink-0 text-ink-muted transition-transform ${unfolded ? "rotate-90" : ""}`}
        />
        <KindIcon kind={file.kind} />
        <span className="sr-only">{t(`nodes.sysreport.kind.${file.kind}`)}</span>
        <code className="min-w-0 flex-1 truncate">{file.path}</code>
        {file.secure && <Sensitive />}
        <Counts added={file.added} deleted={file.deleted} />
      </button>
      {unfolded && (
        <div className="border-t border-line p-2">
          {file.restricted ? (
            <p className="flex items-center gap-1.5 text-ink-muted">
              <LockIcon className="h-3.5 w-3.5" />
              {t("nodes.sysreport.file.restricted")}
            </p>
          ) : file.diff === undefined || file.diff === "" ? (
            <p className="text-ink-muted">
              {file.binary ? t("nodes.sysreport.file.binary") : t("nodes.sysreport.file.noDiff")}
            </p>
          ) : (
            <>
              <UnifiedDiff
                diff={file.diff}
                labels={{
                  added: t("nodes.sysreport.diff.added"),
                  removed: t("nodes.sysreport.diff.removed"),
                  showAll: (count) => t("nodes.sysreport.diff.showAll", { count }),
                }}
              />
              {file.truncated && (
                <p className="mt-1 text-ink-muted">{t("nodes.sysreport.file.truncated")}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The mark of a sensitive path: a lock, and the word for assistive technologies. */
function Sensitive() {
  const { t } = useTranslation();
  return (
    <span title={t("nodes.sysreport.file.secure")} className="shrink-0 text-ink-muted">
      <LockIcon className="h-3.5 w-3.5" />
      <span className="sr-only">{t("nodes.sysreport.file.secure")}</span>
    </span>
  );
}

/** What the node reports at a revision: its commands, then its files by directory. */
function Files({
  nodeId,
  locale,
  cid,
  entries,
  isPending,
  errorMessage,
  filter,
  onHistory,
  onPurgeQueued,
}: {
  nodeId: string;
  locale: string;
  cid: string;
  entries: SysreportEntry[] | undefined;
  isPending: boolean;
  errorMessage: string | null;
  filter: string;
  onHistory: (entry: SysreportEntry) => void;
  /** Offered to a Manager: removing the file from the history for good. */
  onPurgeQueued?: (target: PurgeTarget) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);

  if (isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (errorMessage !== null)
    return (
      <p role="alert" className="text-state-down">
        ■ {t("detail.error", { message: errorMessage })}
      </p>
    );
  if (entries === undefined || entries.length === 0)
    return <p className="text-ink-muted">{t("nodes.sysreport.files.none")}</p>;

  const matching = entries.filter(
    (entry) => filter === "" || entry.path.toLowerCase().includes(filter),
  );
  if (matching.length === 0)
    return <p className="text-ink-muted">{t("nodes.sysreport.files.noMatch")}</p>;

  // Commands first, as one group; then the files, grouped by directory.
  const groups: { label: string; entries: SysreportEntry[] }[] = [];
  const commands = matching.filter((entry) => entry.kind === "command");
  if (commands.length > 0)
    groups.push({
      label: t("nodes.sysreport.files.commands", { count: commands.length }),
      entries: commands.sort((a, b) => a.path.localeCompare(b.path)),
    });
  const byDirectory = new Map<string, SysreportEntry[]>();
  for (const entry of matching.filter((e) => e.kind === "file")) {
    const directory = entry.path.slice(0, Math.max(entry.path.lastIndexOf("/"), 1));
    byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), entry]);
  }
  for (const directory of [...byDirectory.keys()].sort())
    groups.push({
      label: directory,
      entries: (byDirectory.get(directory) ?? []).sort((a, b) => a.path.localeCompare(b.path)),
    });

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.label}>
          <h3 className="mb-1 font-mono text-data font-semibold text-ink-muted">{group.label}</h3>
          <ul className="flex flex-col divide-y divide-line rounded-(--radius-control) border border-line">
            {group.entries.map((entry) => {
              const key = `${entry.kind}:${entry.path}`;
              const expanded = open === key;
              const name =
                entry.kind === "command"
                  ? entry.path
                  : entry.path.slice(entry.path.lastIndexOf("/") + 1);
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    disabled={entry.restricted}
                    title={entry.restricted ? t("nodes.sysreport.file.restricted") : entry.path}
                    onClick={() => {
                      setOpen(expanded ? null : key);
                    }}
                    className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-surface-sunken disabled:text-ink-muted disabled:hover:bg-transparent"
                  >
                    <CaretRightIcon
                      className={`h-3 w-3 shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                    <KindIcon kind={entry.kind} />
                    <code className="min-w-0 flex-1 truncate">{name}</code>
                    {entry.secure && <Sensitive />}
                    <span className="shrink-0 text-data text-ink-muted tabular-nums">
                      {formatBytes(entry.size, locale)}
                    </span>
                  </button>
                  {expanded && !entry.restricted && (
                    <FileContent
                      nodeId={nodeId}
                      cid={cid}
                      entry={entry}
                      onHistory={() => {
                        onHistory(entry);
                      }}
                      onPurgeQueued={onPurgeQueued}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The content of a file or command output, numbered, with what leads to its history. */
function FileContent({
  nodeId,
  cid,
  entry,
  onHistory,
  onPurgeQueued,
}: {
  nodeId: string;
  cid: string;
  entry: SysreportEntry;
  onHistory: () => void;
  onPurgeQueued?: (target: PurgeTarget) => void;
}) {
  const { t } = useTranslation();
  const file = useNodeSysreportFile(nodeId, cid, entry.oid, true);
  const [purging, setPurging] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  if (file.isPending) return <p className="px-7 py-2 text-ink-muted">{t("detail.loading")}</p>;
  if (file.isError)
    return (
      <p role="alert" className="px-7 py-2 text-state-down">
        ■ {t("detail.error", { message: file.error.message })}
      </p>
    );
  const content = file.data.content;

  return (
    <div className="flex flex-col gap-2 border-t border-line bg-surface px-2 py-2 pl-7">
      <div className="flex flex-wrap items-center gap-3">
        <code className="min-w-0 flex-1 truncate text-ink-muted">{entry.path}</code>
        <button type="button" onClick={onHistory} className="text-accent hover:underline">
          {t("nodes.sysreport.files.history")}
        </button>
        {onPurgeQueued !== undefined && (
          <button
            type="button"
            aria-expanded={purging}
            onClick={() => {
              setPurging(!purging);
            }}
            className="text-state-down hover:underline"
          >
            {t("nodes.sysreport.purge.open")}
          </button>
        )}
        {content !== undefined && (
          <button
            type="button"
            onClick={() => {
              void copyText(content).then(() => {
                setCopied(true);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => {
                  setCopied(false);
                }, 2000);
              });
            }}
            className="h-7 rounded-(--radius-control) border border-line px-2 hover:bg-surface-sunken"
          >
            {copied ? t("nodes.sysreport.files.copied") : t("nodes.sysreport.files.copy")}
          </button>
        )}
      </div>
      {purging && onPurgeQueued !== undefined && (
        <SysreportPurgeForm
          nodeId={nodeId}
          entry={entry}
          onQueued={(target) => {
            setPurging(false);
            onPurgeQueued(target);
          }}
          onCancel={() => {
            setPurging(false);
          }}
        />
      )}
      {content === undefined ? (
        <p className="text-ink-muted">{t("nodes.sysreport.file.binary")}</p>
      ) : content === "" ? (
        <p className="text-ink-muted">{t("nodes.sysreport.files.emptyFile")}</p>
      ) : (
        <div className="overflow-x-auto rounded-(--radius-control) border border-line bg-surface-raised font-mono text-data">
          <table className="w-full border-collapse">
            <tbody>
              {content
                .replace(/\n$/, "")
                .split("\n")
                .map((line, index) => (
                  <tr key={index}>
                    <td className="w-10 px-1.5 text-right align-top text-ink-muted tabular-nums select-none">
                      {index + 1}
                    </td>
                    <td className="px-1.5 break-all whitespace-pre-wrap">{line}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {file.data.truncated && (
        <p className="text-ink-muted">{t("nodes.sysreport.files.truncated")}</p>
      )}
    </div>
  );
}
