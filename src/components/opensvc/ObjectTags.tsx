import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TagRow } from "@/features/tags/tag-row";
import { tagFormName } from "@/features/tags/tag-form";
import { TagDataField } from "@/features/tags/TagDataField";
import { Combobox } from "@/components/ui/Combobox";
import { CloseIcon, DatabaseIcon, PlusIcon } from "@/components/ui/icons";
import { ObjectIcon } from "./ObjectIcon";
import { usePeek } from "./use-peek";

/** Attaching and detaching, held by the caller (see `useTagEdit`). */
export interface TagEditControl {
  /** False until the right to edit is established: the buttons stay hidden. */
  allowed: boolean;
  picking: boolean;
  setPicking: (picking: boolean) => void;
  /** Attachable tags, loaded when the picker opens. */
  candidates: TagRow[] | undefined;
  candidatesPending: boolean;
  candidatesError: string | null;
  attach: (tagId: string) => void;
  attaching: boolean;
  attachError: string | null;
  /** `tag_id` of the tag whose detachment awaits confirmation. */
  confirmingDetach: string | null;
  /** Asks confirmation for this tag, or drops the question with `null`. */
  askDetach: (tagId: string | null) => void;
  detach: (tagId: string) => void;
  /** `tag_id` of the tag being detached. */
  detaching: string | null;
  detachError: string | null;
  /** `tag_id` of the tag the last attachment succeeded for, null otherwise. */
  justAttached: string | null;
  /**
   * Stores the data of an attachment, as text; resolves to the refusal of the
   * collector, or null.
   */
  saveAttachData: (tagId: string, text: string) => Promise<string | null>;
}

/**
 * Tags of an object (node, service), at the head of its properties: a few words that
 * say what the object is for or what is promised about it. A click on a tag
 * shows its record in this panel, like any badge naming an object, and adds it to
 * the panel history; its data and its exclusion pattern are in the tooltip.
 *
 * With `edit`, and for whoever has the right, each badge carries a cross that
 * detaches the tag after confirmation, and a button opens a picker of the tags still
 * attachable, filtered as one types. The picker stays open after an attachment, to
 * chain several.
 */
export function ObjectTags({
  tags,
  isPending,
  errorMessage,
  edit,
}: {
  tags: TagRow[] | undefined;
  isPending: boolean;
  errorMessage: string | null;
  edit?: TagEditControl;
}) {
  const { t } = useTranslation();
  const openRecord = usePeek();
  const editable = edit?.allowed === true;
  const section = useRef<HTMLElement>(null);
  const confirming =
    edit === undefined ? undefined : tags?.find((tag) => tag.tag_id === edit.confirmingDetach);
  // The form-based tag whose data shows under the badges, and whether its
  // attachment data opens on its form, as after attaching it.
  const [dataOf, setDataOf] = useState<{ tagId: string; editing: boolean } | null>(null);
  const justAttached = edit?.justAttached ?? null;
  useEffect(() => {
    const attached = tags?.find((tag) => tag.tag_id === justAttached);
    if (attached !== undefined && tagFormName(attached.tag_name) !== null)
      setDataOf({ tagId: attached.tag_id, editing: true });
  }, [justAttached, tags]);
  const shown = dataOf === null ? undefined : tags?.find((tag) => tag.tag_id === dataOf.tagId);
  return (
    <section ref={section} className="mb-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-ink-muted">
          <ObjectIcon kind="tags" />
          {t("objectTags.title")}
          {tags !== undefined && <span className="font-normal tabular-nums">({tags.length})</span>}
        </h3>
        {editable && !edit.picking && (
          <button
            type="button"
            onClick={() => {
              edit.setPicking(true);
            }}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-(--radius-control) border border-line px-2 text-ink-muted hover:border-line-strong hover:text-ink"
          >
            <PlusIcon />
            {t("objectTags.attach.open")}
          </button>
        )}
      </div>
      {isPending ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : errorMessage !== null ? (
        <p role="alert" className="text-state-down">
          ■ {t("detail.error", { message: errorMessage })}
        </p>
      ) : tags === undefined || tags.length === 0 ? (
        <p className="text-ink-muted">{t("objectTags.none")}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("objectTags.title")}>
          {tags.map((tag) => {
            const details = [
              tag.tag_data === "" ? "" : t("objectTags.data", { data: tag.tag_data }),
              tag.tag_exclude === "" ? "" : t("objectTags.exclude", { pattern: tag.tag_exclude }),
            ].filter((line) => line !== "");
            const detaching = edit?.detaching === tag.tag_id;
            return (
              <li
                key={tag.tag_id || tag.tag_name}
                className={`inline-flex items-stretch overflow-hidden rounded-full bg-tag text-data font-medium text-tag-ink ${detaching ? "opacity-60" : ""}`}
              >
                {/* Like any badge naming an object: a click, or Enter, shows the tag
                    in this panel and adds it to the history. */}
                <button
                  type="button"
                  title={[t("objectTags.open"), ...details].join("\n")}
                  onClick={() => {
                    openRecord("tag", tag.tag_id);
                  }}
                  className={`inline-flex items-center py-0.5 hover:bg-tag-hover ${editable ? "pr-1.5 pl-2" : "px-2"}`}
                >
                  {tag.tag_name}
                </button>
                {tagFormName(tag.tag_name) !== null && (
                  <button
                    type="button"
                    aria-expanded={shown?.tag_id === tag.tag_id}
                    aria-label={t("objectTags.dataOf", { name: tag.tag_name })}
                    title={t("objectTags.dataOf", { name: tag.tag_name })}
                    onClick={() => {
                      setDataOf(
                        shown?.tag_id === tag.tag_id ? null : { tagId: tag.tag_id, editing: false },
                      );
                    }}
                    className="inline-flex items-center border-l border-tag-ink/30 px-1.5 hover:bg-tag-hover aria-expanded:bg-tag-hover"
                  >
                    <DatabaseIcon width={11} height={11} />
                  </button>
                )}
                {editable && (
                  <button
                    type="button"
                    data-detach={tag.tag_id}
                    disabled={edit.detaching !== null}
                    aria-expanded={edit.confirmingDetach === tag.tag_id}
                    aria-label={t("objectTags.detach.label", { name: tag.tag_name })}
                    title={t("objectTags.detach.label", { name: tag.tag_name })}
                    onClick={() => {
                      edit.askDetach(tag.tag_id);
                    }}
                    className="inline-flex items-center border-l border-tag-ink/30 pr-1.5 pl-1 hover:bg-tag-hover disabled:cursor-wait"
                  >
                    <CloseIcon width={10} height={10} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {shown !== undefined && (
        <TagData
          key={shown.tag_id}
          tag={shown}
          startEditing={dataOf?.editing === true}
          onSave={editable ? (text) => edit.saveAttachData(shown.tag_id, text) : undefined}
          onOpenTag={() => {
            openRecord("tag", shown.tag_id);
          }}
          onClose={() => {
            setDataOf(null);
          }}
        />
      )}
      {edit !== undefined && confirming !== undefined && (
        <DetachConfirm
          name={confirming.tag_name}
          onConfirm={() => {
            edit.detach(confirming.tag_id);
          }}
          onCancel={() => {
            edit.askDetach(null);
            // The focus goes back to the cross that opened the question.
            section.current
              ?.querySelector<HTMLButtonElement>(`[data-detach="${CSS.escape(confirming.tag_id)}"]`)
              ?.focus();
          }}
        />
      )}
      {edit?.detachError != null && (
        <p role="alert" className="mt-2 text-state-down">
          ■ {edit.detachError}
        </p>
      )}
      {edit?.picking === true && <AttachForm attach={edit} />}
    </section>
  );
}

/**
 * The data of a form-based tag on this object, under the badges: that of the
 * attachment, which whoever may change the tags of the object edits with the tag's
 * form; and that of the tag, shared by every node and service carrying it, shown
 * only: it changes in the tag's panel, where everything it serves is listed.
 */
function TagData({
  tag,
  startEditing,
  onSave,
  onOpenTag,
  onClose,
}: {
  tag: TagRow;
  startEditing: boolean;
  onSave?: (text: string) => Promise<string | null>;
  onOpenTag: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formName = tagFormName(tag.tag_name);
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-(--radius-panel) border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold">{t("objectTags.dataTitle", { name: tag.tag_name })}</h4>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("detail.close")}
          title={t("detail.close")}
          className="ml-auto rounded-(--radius-control) p-0.5 text-ink-muted hover:text-ink"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <section>
        <h5 className="mb-1 text-ink-muted">{t("objectTags.attachData")}</h5>
        <TagDataField
          formName={formName}
          value={tag.tag_attach_data}
          onSave={onSave}
          startEditing={startEditing && onSave !== undefined}
        />
      </section>
      <section>
        <h5 className="mb-1 flex flex-wrap items-center gap-2 text-ink-muted">
          {t("objectTags.tagData")}
          <button
            type="button"
            onClick={onOpenTag}
            className="font-normal text-accent underline underline-offset-2"
          >
            {t("objectTags.tagDataWhere")}
          </button>
        </h5>
        <TagDataField formName={formName} value={tag.tag_data} />
      </section>
    </div>
  );
}

/**
 * Question asked under the badges, on the model of `ConfirmButton`: the confirm
 * button takes the focus, which reads the question out to screen readers, and Escape
 * abandons it.
 */
function DetachConfirm({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useRef<HTMLButtonElement>(null);
  const question = t("objectTags.detach.question", { name });

  useEffect(() => {
    confirm.current?.focus();
  }, [name]);

  return (
    <div
      role="group"
      aria-label={question}
      className="mt-2 flex flex-wrap items-center gap-2"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <p>{question}</p>
      <button
        ref={confirm}
        type="button"
        onClick={onConfirm}
        className="h-7 rounded-(--radius-control) bg-state-down px-3 font-medium text-surface-raised"
      >
        {t("objectTags.detach.confirm")}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-7 rounded-(--radius-control) border border-line px-3"
      >
        {t("detail.cancel")}
      </button>
    </div>
  );
}

function AttachForm({ attach }: { attach: TagEditControl }) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState("");
  const candidates = attach.candidates ?? [];
  // A tag just attached leaves the list: the selection falls back to empty.
  const selected = candidates.some((tag) => tag.tag_id === choice) ? choice : "";
  const input = useRef<HTMLInputElement>(null);

  // The field takes the focus when the picker opens, and takes it back after each
  // attachment to chain them: the button, disabled while sending, would have lost it.
  useEffect(() => {
    if (!attach.attaching) input.current?.focus();
  }, [attach.attaching, attach.candidatesPending]);

  return (
    <div className="mt-2">
      {attach.candidatesPending ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : attach.candidatesError !== null ? (
        <p role="alert" className="text-state-down">
          ■ {t("detail.error", { message: attach.candidatesError })}
        </p>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (selected !== "") attach.attach(selected);
          }}
        >
          {candidates.length === 0 ? (
            <p className="text-ink-muted">{t("objectTags.attach.noCandidate")}</p>
          ) : (
            <>
              <Combobox
                label={t("objectTags.attach.choose")}
                placeholder={t("objectTags.attach.placeholder")}
                emptyText={t("objectTags.attach.noMatch")}
                options={candidates.map((tag) => ({ value: tag.tag_id, label: tag.tag_name }))}
                value={selected}
                onChange={setChoice}
                inputRef={input}
                className="min-w-0 flex-1"
              />
              <button
                type="submit"
                disabled={attach.attaching || selected === ""}
                className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
              >
                {attach.attaching ? t("objectTags.attach.pending") : t("objectTags.attach.submit")}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              attach.setPicking(false);
            }}
            className="h-7 rounded-(--radius-control) border border-line px-3 text-ink-muted hover:text-ink"
          >
            {t("objectTags.attach.close")}
          </button>
        </form>
      )}
      {attach.attachError !== null && (
        <p role="alert" className="mt-2 text-state-down">
          ■ {attach.attachError}
        </p>
      )}
    </div>
  );
}
