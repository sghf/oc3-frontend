import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SlideOver } from "@/components/ui/SlideOver";
import { UnifiedDiff } from "@/components/ui/UnifiedDiff";
import {
  ArrowLeftIcon,
  CloseIcon,
  DownloadIcon,
  HistoryIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { diffExports, type FieldChange, type ObjectChange } from "./compliance-diff";
import {
  useComplianceHistory,
  useComplianceVersion,
  versionSource,
  type ComplianceVersion,
  type HistoryObject,
} from "./use-compliance-history";
import { BUTTON } from "./ui";

/** Versions read at first, and added by "show older". */
const PAGE = 50;

type SourceFilter = "all" | "designer" | "elsewhere";

/**
 * The history of the compliance export, kept in git by the commits of the
 * designer: the versions newest first, grouped by day, each opening on what it
 * changed, object by object, with the raw diff and the export of the version.
 * `object` narrows it to the versions in which that object changed.
 */
export function HistoryPanel({
  open,
  object,
  onClose,
  onClearObject,
  canOpen,
  onOpen,
}: {
  open: boolean;
  object: HistoryObject | null;
  onClose: () => void;
  onClearObject: () => void;
  /** Whether an object of a version is still in the designer, to be opened there. */
  canOpen: (change: ObjectChange) => boolean;
  onOpen: (change: ObjectChange) => void;
}) {
  const { t } = useTranslation();
  const [limit, setLimit] = useState(PAGE);
  const [source, setSource] = useState<SourceFilter>("all");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const history = useComplianceHistory(object, limit, open);

  const needle = text.trim().toLowerCase();
  const versions = (history.data ?? []).filter(
    (v) =>
      (source === "all" || versionSource(v) === source) &&
      (needle === "" || `${v.subject}\n${v.body}`.toLowerCase().includes(needle)),
  );

  return (
    <SlideOver
      open={open}
      title={t("designer.historyPanel.title")}
      onClose={() => {
        setSelected(null);
        onClose();
      }}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<HistoryIcon className="h-4 w-4" />}
      size="wide"
    >
      {selected !== null ? (
        <VersionView
          commit={selected}
          onBack={() => {
            setSelected(null);
          }}
          canOpen={canOpen}
          onOpen={onOpen}
        />
      ) : (
        <div className="space-y-3">
          {object !== null && (
            <p className="flex flex-wrap items-center gap-1.5">
              {t("designer.historyPanel.onlyObject")}
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-0.5 pr-0.5 pl-2">
                <ObjectIcon kind={object.kind} className="h-3.5 w-3.5" />
                {object.name}
                <button
                  type="button"
                  onClick={onClearObject}
                  title={t("designer.historyPanel.allObjects")}
                  className="rounded-full p-0.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
                >
                  <CloseIcon className="h-3 w-3" />
                  <span className="sr-only">{t("designer.historyPanel.allObjects")}</span>
                </button>
              </span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label={t("designer.historyPanel.kindFilter")}
              className="flex gap-1"
            >
              {(["all", "designer", "elsewhere"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={source === value}
                  onClick={() => {
                    setSource(value);
                  }}
                  className="rounded-full border border-line px-2 py-0.5 text-ink-muted hover:text-ink aria-checked:border-accent aria-checked:bg-accent-soft aria-checked:text-ink"
                >
                  {t(`designer.historyPanel.source.${value}`)}
                </button>
              ))}
            </div>
            <div className="relative min-w-40 flex-1">
              <SearchIcon className="pointer-events-none absolute top-2 left-2 h-3.5 w-3.5 text-ink-muted" />
              <input
                type="search"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                }}
                aria-label={t("designer.historyPanel.textFilter")}
                placeholder={t("designer.historyPanel.textFilter")}
                className="h-8 w-full rounded-(--radius-control) border border-line bg-surface pr-2 pl-7"
              />
            </div>
          </div>

          {history.isPending ? (
            <p className="text-ink-muted">{t("designer.historyPanel.loading")}</p>
          ) : history.isError ? (
            <p role="alert" className="text-state-down">
              ■ {history.error.message}
            </p>
          ) : versions.length === 0 ? (
            <p className="text-ink-muted">
              {(history.data ?? []).length === 0
                ? t("designer.historyPanel.empty")
                : t("designer.historyPanel.noMatch")}
            </p>
          ) : (
            <VersionList
              versions={versions}
              onSelect={(commit) => {
                setSelected(commit);
              }}
            />
          )}
          {history.data?.length === limit && (
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                setLimit(limit + PAGE);
              }}
            >
              {t("designer.historyPanel.older")}
            </button>
          )}
        </div>
      )}
    </SlideOver>
  );
}

/** "Test Manager" of "Test Manager <t-manager@test.local>". */
function authorName(author: string): string {
  return author.replace(/\s*<[^>]*>$/, "") || author;
}

/** The versions grouped by day: today, yesterday, then the date. */
function VersionList({
  versions,
  onSelect,
}: {
  versions: ComplianceVersion[];
  onSelect: (commit: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const dayOf = (iso: string) => new Date(iso).toDateString();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const days: { label: string; versions: ComplianceVersion[] }[] = [];
  for (const version of versions) {
    const day = dayOf(version.date);
    const label =
      day === today
        ? t("designer.historyPanel.today")
        : day === yesterday
          ? t("designer.historyPanel.yesterday")
          : new Date(version.date).toLocaleDateString(i18n.language, { dateStyle: "full" });
    const last = days.at(-1);
    if (last?.label === label) last.versions.push(version);
    else days.push({ label, versions: [version] });
  }
  return (
    <div className="space-y-3">
      {days.map((day) => (
        <section key={day.label}>
          <h3 className="mb-1 text-data font-semibold tracking-wide text-ink-muted uppercase">
            {day.label}
          </h3>
          <ul className="space-y-1">
            {day.versions.map((version) => {
              const source = versionSource(version);
              return (
                <li key={version.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(version.id);
                    }}
                    className="flex w-full items-start gap-2 rounded-(--radius-control) border border-transparent px-2 py-1.5 text-left hover:border-line hover:bg-surface-sunken"
                  >
                    {source === "designer" ? (
                      <ObjectIcon kind="designer" className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <HistoryIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">
                          {source === "designer"
                            ? version.subject
                            : t("designer.historyPanel.elsewhere")}
                        </span>
                      </span>
                      <span className="block text-ink-muted">
                        <code className="font-mono">{version.id.slice(0, 7)}</code> ·{" "}
                        {new Date(version.date).toLocaleTimeString(i18n.language, {
                          timeStyle: "short",
                        })}{" "}
                        · {authorName(version.author)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A version: who, when, its message, what it changed object by object, its diff and its export. */
function VersionView({
  commit,
  onBack,
  canOpen,
  onOpen,
}: {
  commit: string;
  onBack: () => void;
  canOpen: (change: ObjectChange) => boolean;
  onOpen: (change: ObjectChange) => void;
}) {
  const { t, i18n } = useTranslation();
  const detail = useComplianceVersion(commit);
  const [raw, setRaw] = useState(false);
  const back = (
    <button type="button" className={BUTTON} onClick={onBack}>
      <ArrowLeftIcon className="h-3.5 w-3.5" />
      {t("designer.historyPanel.back")}
    </button>
  );
  if (detail.isPending)
    return (
      <div className="space-y-3">
        {back}
        <p className="text-ink-muted">{t("designer.historyPanel.loading")}</p>
      </div>
    );
  if (detail.isError)
    return (
      <div className="space-y-3">
        {back}
        <p role="alert" className="text-state-down">
          ■ {detail.error.message}
        </p>
      </div>
    );
  const { version, export: content, previous, previous_id: previousId, diff } = detail.data;
  const source = versionSource(version);
  const changes = diffExports(previous, content);

  const download = () => {
    const blob = new Blob([`${JSON.stringify(content, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `compliance-${version.id.slice(0, 7)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {back}
      <header>
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {source === "designer" ? (
            <ObjectIcon kind="designer" className="h-4 w-4" />
          ) : (
            <HistoryIcon className="h-4 w-4 text-ink-muted" />
          )}
          {source === "designer" ? version.subject : t("designer.historyPanel.elsewhere")}
        </p>
        <p className="text-ink-muted">
          <code className="font-mono">{version.id.slice(0, 7)}</code> ·{" "}
          {new Date(version.date).toLocaleString(i18n.language, {
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          · {version.author}
        </p>
      </header>

      {source === "designer" && version.body !== "" && (
        <section className="rounded-(--radius-panel) border border-line p-3">
          <h3 className="mb-1 font-semibold">{t("designer.historyPanel.message")}</h3>
          <pre className="font-sans whitespace-pre-wrap">{version.body}</pre>
        </section>
      )}

      <section className="rounded-(--radius-panel) border border-line p-3">
        <h3 className="mb-2 font-semibold">
          {previousId === undefined
            ? t("designer.historyPanel.firstVersion")
            : t("designer.historyPanel.changes", { commit: previousId.slice(0, 7) })}
        </h3>
        {previousId === undefined ? (
          <p className="text-ink-muted">
            {t("designer.historyPanel.firstVersionHint", {
              rulesets: content.rulesets.length,
              modulesets: content.modulesets.length,
              filtersets: content.filtersets.length,
            })}
          </p>
        ) : changes.length === 0 ? (
          <p className="text-ink-muted">{t("designer.historyPanel.noChange")}</p>
        ) : (
          <ul className="space-y-2">
            {changes.map((change) => (
              <ChangeRow
                key={`${change.kind}:${String(change.id)}`}
                change={change}
                canOpen={canOpen(change)}
                onOpen={() => {
                  onOpen(change);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-expanded={raw}
          className={BUTTON}
          onClick={() => {
            setRaw(!raw);
          }}
        >
          {t("designer.historyPanel.rawDiff")}
        </button>
        <button type="button" className={BUTTON} onClick={download}>
          <DownloadIcon className="h-3.5 w-3.5" />
          {t("designer.historyPanel.download")}
        </button>
      </div>
      {raw &&
        (diff.trim() === "" ? (
          <p className="text-ink-muted">{t("designer.historyPanel.noChange")}</p>
        ) : (
          <UnifiedDiff
            // From the first hunk, as the component reads it: git's header says
            // nothing more than the line above.
            diff={diff.slice(Math.max(0, diff.indexOf("@@")))}
            labels={{
              added: t("nodes.sysreport.diff.added"),
              removed: t("nodes.sysreport.diff.removed"),
              showAll: (count) => t("nodes.sysreport.diff.showAll", { count }),
            }}
          />
        ))}
    </div>
  );
}

/** Created, deleted or modified: a mark and a word, the tint only adding to them. */
const STATUS_MARK: Record<ObjectChange["status"], { glyph: string; ink: string }> = {
  created: { glyph: "+", ink: "text-state-up" },
  deleted: { glyph: "−", ink: "text-state-down" },
  modified: { glyph: "✎", ink: "text-state-warn" },
};

/** One object of a version: what became of it, and the properties that changed. */
function ChangeRow({
  change,
  canOpen,
  onOpen,
}: {
  change: ObjectChange;
  canOpen: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const mark = STATUS_MARK[change.status];
  const name = (
    <span className="inline-flex items-center gap-1 font-medium">
      <ObjectIcon kind={change.kind} className="h-3.5 w-3.5" />
      {change.name}
    </span>
  );
  return (
    <li>
      <p className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className={`w-3 text-center font-semibold ${mark.ink}`}>
          {mark.glyph}
        </span>
        <span className="text-ink-muted">{t(`designer.kind.${change.kind}`)}</span>
        {canOpen ? (
          <button
            type="button"
            onClick={onOpen}
            title={t("designer.historyPanel.openObject")}
            className="rounded-(--radius-control) hover:underline"
          >
            {name}
          </button>
        ) : (
          name
        )}
        <span className={mark.ink}>{t(`designer.historyPanel.status.${change.status}`)}</span>
      </p>
      {change.fields.length > 0 && (
        <dl className="mt-1 ml-5 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-0.5">
          {change.fields.map((field) => (
            <FieldRow key={field.field} field={field} />
          ))}
        </dl>
      )}
    </li>
  );
}

function FieldRow({ field }: { field: FieldChange }) {
  const { t } = useTranslation();
  const parts: string[] = [];
  if (field.from !== undefined || field.to !== undefined)
    parts.push(
      t("designer.historyPanel.fromTo", {
        from: field.from === "" ? "∅" : field.from,
        to: field.to === "" ? "∅" : field.to,
      }),
    );
  if (field.added !== undefined && field.added.length > 0)
    parts.push(`+ ${field.added.join(", ")}`);
  if (field.removed !== undefined && field.removed.length > 0)
    parts.push(`− ${field.removed.join(", ")}`);
  if (field.changed !== undefined && field.changed.length > 0)
    parts.push(t("designer.historyPanel.changedItems", { items: field.changed.join(", ") }));
  if (parts.length === 0) parts.push(t("designer.historyPanel.changedField"));
  return (
    <>
      <dt className="text-ink-muted">{t(`designer.historyPanel.fields.${field.field}`)}</dt>
      <dd className="space-y-0.5">
        {parts.map((part) => (
          <p key={part}>{part}</p>
        ))}
      </dd>
    </>
  );
}
