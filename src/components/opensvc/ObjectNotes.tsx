import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DateTime } from "@/components/ui/DateTime";
import { Markdown } from "@/components/ui/Markdown";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { FileIcon, HistoryIcon, PencilIcon } from "@/components/ui/icons";
import { useEffectiveUser } from "@/lib/api/impersonation";
import {
  useSaveWiki,
  useWiki,
  useWikiRevision,
  WikiConflictError,
  type WikiKind,
  type WikiRevision,
} from "@/lib/api/wiki";
import { formatDateTime } from "@/lib/format";

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2.5 text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-40";
const PRIMARY =
  "inline-flex h-7 items-center gap-1.5 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60";

/** The size of a revision the api accepts, in bytes of UTF-8. */
const BODY_MAX = 60000;
const CHANGE_NOTE_MAX = 200;

interface Draft {
  body: string;
  changeNote: string;
  /** The revision edited, 0 for a page without any. */
  baseId: number;
}

// The drafts being written, by object: switching to another tab of the panel and
// back finds the draft again, until the page reloads.
const drafts = new Map<string, Draft>();

/**
 * The notes of a node or a service: a wiki page in Markdown, saved as
 * revisions, for what the collector cannot know (contacts, procedures, known
 * issues). Anyone who sees the object reads them; its responsibles and the
 * Managers write them. A save names the revision it edits: when someone saved
 * meanwhile, nothing is saved and the draft is kept.
 */
export function ObjectNotes({ kind, id }: { kind: WikiKind; id: string }) {
  const { t } = useTranslation();
  const page = useWiki(kind, id);
  const draftKey = `${kind}:${id}`;
  const [draft, setDraftState] = useState<Draft | undefined>(() => drafts.get(draftKey));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shownId, setShownId] = useState<number | undefined>(undefined);
  const shown = useWikiRevision(kind, id, shownId);

  const setDraft = (next: Draft | undefined) => {
    if (next === undefined) drafts.delete(draftKey);
    else drafts.set(draftKey, next);
    setDraftState(next);
  };

  if (page.isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (page.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {t("detail.error", { message: page.error.message })}
      </p>
    );

  const { revision, revisions, total, writable } = page.data;
  const latestId = revision?.id ?? 0;
  const edit = (body: string, changeNote = "") => {
    setShownId(undefined);
    setDraft({ body, changeNote, baseId: latestId });
  };

  if (draft !== undefined)
    return (
      <NotesEditor
        kind={kind}
        id={id}
        draft={draft}
        latest={revision}
        onChange={setDraft}
        onDone={() => {
          setDraft(undefined);
        }}
      />
    );

  const viewed = shownId === undefined ? revision : shown.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-ink-muted">
          {revision === null ? (
            t("notes.none", { context: kind })
          ) : (
            <RevisionLine revision={revision} labelKey="notes.lastEdited" />
          )}
        </p>
        {total > 0 && (
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => {
              setHistoryOpen(!historyOpen);
            }}
            className={BUTTON}
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            {t("notes.history", { count: total })}
          </button>
        )}
        {writable && (
          <button
            type="button"
            onClick={() => {
              edit(revision?.body ?? "");
            }}
            className={revision === null ? PRIMARY : BUTTON}
          >
            <PencilIcon className="h-3.5 w-3.5" />
            {revision === null ? t("notes.write") : t("notes.edit")}
          </button>
        )}
      </div>

      {historyOpen && (
        <ol
          aria-label={t("notes.historyLabel")}
          className="max-h-60 overflow-y-auto rounded-(--radius-panel) border border-line"
        >
          {revisions.map((r, index) => {
            const current = (shownId ?? latestId) === r.id;
            return (
              <li key={r.id} className="border-b border-line/60 last:border-b-0">
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  onClick={() => {
                    setShownId(index === 0 ? undefined : r.id);
                  }}
                  className={`flex w-full flex-wrap items-center gap-x-2 px-3 py-1.5 text-left ${current ? "bg-accent-soft" : "hover:bg-surface-sunken/60"}`}
                >
                  <DateTime value={r.saved_on} />
                  <span>{r.author === "" ? t("notes.unknownAuthor") : r.author}</span>
                  {index === 0 && (
                    <span className="rounded-full bg-surface-sunken px-2 text-data text-ink-muted">
                      {t("notes.latest")}
                    </span>
                  )}
                  {r.change_note !== "" && (
                    <span className="min-w-0 truncate text-ink-muted">— {r.change_note}</span>
                  )}
                </button>
              </li>
            );
          })}
          {total > revisions.length && (
            <li className="px-3 py-1.5 text-ink-muted">
              {t("notes.older", { count: total - revisions.length })}
            </li>
          )}
        </ol>
      )}

      {shownId !== undefined && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-(--radius-panel) border border-state-warn/40 bg-state-warn-soft px-3 py-2"
        >
          <span className="min-w-0 flex-1 text-state-warn">
            ◆{" "}
            {shown.data === undefined ? (
              t("detail.loading")
            ) : (
              <RevisionLine revision={shown.data} labelKey="notes.pastRevision" />
            )}
          </span>
          {writable && shown.data !== undefined && (
            <button
              type="button"
              onClick={() => {
                edit(
                  shown.data.body ?? "",
                  t("notes.restoredNote", { date: formatDateTime(shown.data.saved_on) }),
                );
              }}
              className={BUTTON}
            >
              {t("notes.restore")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShownId(undefined);
            }}
            className={BUTTON}
          >
            {t("notes.backToLatest")}
          </button>
        </div>
      )}
      {shown.isError && (
        <p role="alert" className="text-state-down">
          ■ {shown.error.message}
        </p>
      )}

      {viewed !== null && viewed !== undefined && (viewed.body ?? "").trim() !== "" && (
        <Markdown text={viewed.body ?? ""} className="max-w-3xl" />
      )}
      {viewed !== null && viewed !== undefined && (viewed.body ?? "").trim() === "" && (
        <p className="text-ink-muted">{t("notes.emptyRevision")}</p>
      )}
      {revision === null && (
        <p className="max-w-3xl text-ink-muted">
          {writable ? t("notes.purpose") : t("notes.readOnly")}
        </p>
      )}
    </div>
  );
}

/** "Last edited by …, on …", or of a past revision, with its change note. */
function RevisionLine({ revision, labelKey }: { revision: WikiRevision; labelKey: string }) {
  const { t } = useTranslation();
  return (
    <>
      {t(labelKey, {
        author: revision.author === "" ? t("notes.unknownAuthor") : revision.author,
      })}{" "}
      <DateTime value={revision.saved_on} />
      {revision.change_note !== "" && <> — {revision.change_note}</>}
    </>
  );
}

/**
 * The editor of the notes: the Markdown text and its preview, an optional
 * change note, and a signature to insert ("date — author") as the legacy wiki
 * offered. Ctrl+Enter saves.
 */
function NotesEditor({
  kind,
  id,
  draft,
  latest,
  onChange,
  onDone,
}: {
  kind: WikiKind;
  id: string;
  draft: Draft;
  latest: WikiRevision | null;
  onChange: (draft: Draft) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveWiki(kind, id);
  const user = useEffectiveUser();
  const [view, setView] = useState<"write" | "preview">("write");
  const area = useRef<HTMLTextAreaElement>(null);
  const bodyId = useId();
  const noteId = useId();
  const bytes = new TextEncoder().encode(draft.body).length;
  const tooLong = bytes > BODY_MAX;
  const unchanged =
    latest === null
      ? draft.body.trim() === ""
      : draft.baseId === latest.id && draft.body === latest.body;
  // Someone saved since the draft started: the latest revision is not the one edited.
  const behind = latest !== null && draft.baseId !== latest.id;
  const conflict = save.error instanceof WikiConflictError || behind;

  const submit = (baseId: number) => {
    if (tooLong || save.isPending) return;
    save.mutate(
      { body: draft.body, changeNote: draft.changeNote.trim(), baseId },
      { onSuccess: onDone },
    );
  };

  const insertSignature = () => {
    const signature = `*${formatDateTime(new Date().toISOString())} — ${user ?? ""}*`;
    const element = area.current;
    const start = element?.selectionStart ?? draft.body.length;
    const end = element?.selectionEnd ?? draft.body.length;
    onChange({ ...draft, body: draft.body.slice(0, start) + signature + draft.body.slice(end) });
    window.requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + signature.length, start + signature.length);
    });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedToggle
          options={[
            { value: "write", label: t("notes.writeTab"), icon: PencilIcon },
            { value: "preview", label: t("notes.preview"), icon: FileIcon },
          ]}
          value={view}
          onChange={setView}
          label={t("notes.editorView")}
        />
        <span className="flex-1" />
        {view === "write" && (
          <button type="button" onClick={insertSignature} className={BUTTON}>
            {t("notes.signature")}
          </button>
        )}
      </div>

      {view === "write" ? (
        <>
          <label htmlFor={bodyId} className="sr-only">
            {t("notes.bodyLabel")}
          </label>
          <textarea
            id={bodyId}
            ref={area}
            rows={16}
            autoFocus
            spellCheck
            value={draft.body}
            aria-describedby={`${bodyId}-hint`}
            onChange={(event) => {
              onChange({ ...draft, body: event.target.value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submit(draft.baseId);
              }
            }}
            className="w-full rounded-(--radius-control) border border-line bg-surface p-2 font-mono text-data"
          />
          <p id={`${bodyId}-hint`} className="text-data text-ink-muted">
            {t("notes.syntaxHint")}
          </p>
        </>
      ) : (
        <div className="min-h-40 rounded-(--radius-control) border border-line p-3">
          {draft.body.trim() === "" ? (
            <p className="text-ink-muted">{t("notes.emptyRevision")}</p>
          ) : (
            <Markdown text={draft.body} />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={noteId} className="text-ink-muted">
          {t("notes.changeNote")}
        </label>
        <input
          id={noteId}
          value={draft.changeNote}
          maxLength={CHANGE_NOTE_MAX}
          placeholder={t("notes.changeNotePlaceholder")}
          onChange={(event) => {
            onChange({ ...draft, changeNote: event.target.value });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit(draft.baseId);
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-(--radius-control) border border-line bg-surface px-2"
        />
      </div>

      {tooLong && (
        <p role="alert" className="text-state-down">
          ■ {t("notes.tooLong", { bytes, max: BODY_MAX })}
        </p>
      )}
      {conflict && latest !== null && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-(--radius-panel) border border-state-warn/40 bg-state-warn-soft px-3 py-2"
        >
          <p className="text-state-warn">
            ▲ <RevisionLine revision={latest} labelKey="notes.conflict" />
          </p>
          <p>{t("notes.conflictHelp")}</p>
        </div>
      )}
      {save.isError && !(save.error instanceof WikiConflictError) && (
        <p role="alert" className="text-state-down">
          ■ {save.error.message}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onDone} className={BUTTON}>
          {t("detail.cancel")}
        </button>
        {conflict && latest !== null ? (
          <button
            type="button"
            disabled={tooLong || save.isPending}
            onClick={() => {
              onChange({ ...draft, baseId: latest.id });
              submit(latest.id);
            }}
            className={PRIMARY}
          >
            {save.isPending ? t("notes.saving") : t("notes.overwrite")}
          </button>
        ) : (
          <button
            type="button"
            disabled={tooLong || unchanged || save.isPending}
            title={unchanged ? t("notes.unchanged") : undefined}
            onClick={() => {
              submit(draft.baseId);
            }}
            className={PRIMARY}
          >
            {save.isPending ? t("notes.saving") : t("notes.save")}
          </button>
        )}
      </div>
    </div>
  );
}
