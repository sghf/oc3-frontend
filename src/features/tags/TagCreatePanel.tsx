import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { SlideOver } from "@/components/ui/SlideOver";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { Combobox } from "@/components/ui/Combobox";
import { useFormDefinitionByName } from "@/features/forms/use-form";
import { toTagRows } from "./tag-row";
import { tagFormName } from "./tag-form";
import { useTagForms } from "./use-tag-forms";

interface TagFields {
  tag_name: string;
  tag_exclude: string;
  tag_data: string;
}

const EMPTY: TagFields = { tag_name: "", tag_exclude: "", tag_data: "" };

const INPUT = "h-8 w-full rounded-(--radius-control) border bg-surface px-2 font-mono";

/**
 * What the optional fields are: an invalid exclusion expression, refused before
 * sending; data that is not JSON, accepted and stored as text, as both collectors
 * do (`POST /tags` keeps it as it is, the lists decode it when they can).
 */
function problems(fields: TagFields): { exclude: boolean; dataAsText: boolean } {
  let exclude = false;
  if (fields.tag_exclude.trim() !== "") {
    try {
      new RegExp(fields.tag_exclude);
    } catch {
      exclude = true;
    }
  }
  let dataAsText = false;
  if (fields.tag_data.trim() !== "") {
    try {
      JSON.parse(fields.tag_data);
    } catch {
      dataAsText = true;
    }
  }
  return { exclude, dataAsText };
}

/**
 * Creating a tag: its name, and optionally the regular expression of the tags it
 * cannot be attached along with, and free data, JSON or text, as `POST /tags`
 * takes them.
 *
 * The API requires the TagManager privilege and refuses a name already taken; its
 * message is shown as it is. Data that is not JSON is not refused: the hint says
 * it will be stored as text, as the historical collector stores it.
 *
 * Contextual help explains form-based tags, `<form>::<name>`, whose data a form
 * describes: a section to unfold, with a picker starting the name with a form,
 * and hints under the name and the data saying what the name typed makes of the
 * tag, and whether its form exists.
 */
export function TagCreatePanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** The `tag_id` of the new tag. */
  onCreated: (tagId: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<TagFields>(EMPTY);

  // Every opening starts from an empty panel.
  useEffect(() => {
    if (open) setFields(EMPTY);
  }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      const body: { tag_name: string; tag_exclude?: string; tag_data?: string } = {
        tag_name: fields.tag_name.trim(),
      };
      if (fields.tag_exclude.trim() !== "") body.tag_exclude = fields.tag_exclude.trim();
      if (fields.tag_data.trim() !== "") body.tag_data = fields.tag_data.trim();
      const { data, error } = await api.POST("/tags", { body });
      if (error !== undefined) throw new Error(problemText(error));
      return toTagRows(data.data)[0]?.tag_id;
    },
    onSuccess: async (tagId) => {
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      onCreated(tagId);
      onClose();
    },
  });

  const invalid = problems(fields);
  const [helpOpen, setHelpOpen] = useState(false);
  const forms = useTagForms(helpOpen);
  const formName = tagFormName(fields.tag_name.trim());
  const form = useFormDefinitionByName(formName ?? "");
  // What the name makes of the tag: plain, or described by a form that exists or not.
  const nameHint =
    formName === null
      ? t("tags.create.formHelp.plainHint")
      : form.isPending
        ? t("tags.create.formHelp.checking", { form: formName })
        : form.data === null || form.data === undefined
          ? null
          : t("tags.create.formHelp.formBased", { form: formName });
  const missingForm =
    formName !== null && !form.isPending && (form.data === null || form.data === undefined);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid.exclude) return;
    create.mutate();
  }

  function set<K extends keyof TagFields>(key: K, value: TagFields[K]) {
    setFields((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <SlideOver
      open={open}
      title={t("tags.create.title")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="tag" />}
    >
      <p className="mb-3 text-ink-muted">{t("tags.create.intro")}</p>

      <details
        className="mb-4 rounded-(--radius-panel) border border-line bg-surface px-3 py-2"
        onToggle={(event) => {
          setHelpOpen(event.currentTarget.open);
        }}
      >
        <summary className="cursor-pointer font-medium">
          {t("tags.create.formHelp.summary")}
        </summary>
        <div className="mt-2 flex flex-col gap-2 text-ink-muted">
          <p>
            {t("tags.create.formHelp.naming")}{" "}
            <code className="rounded-(--radius-control) bg-surface-sunken px-1 font-mono whitespace-nowrap text-ink">
              {t("tags.create.formHelp.pattern")}
            </code>
            . {t("tags.create.formHelp.namingThen")}
          </p>
          <p>
            {t("tags.create.formHelp.example")}{" "}
            <code className="rounded-(--radius-control) bg-surface-sunken px-1 font-mono whitespace-nowrap text-ink">
              keyval::sshd
            </code>
          </p>
          <ul className="list-disc pl-5">
            <li>{t("tags.create.formHelp.tagData")}</li>
            <li>{t("tags.create.formHelp.attachData")}</li>
          </ul>
          <p>{t("tags.create.formHelp.after")}</p>
          <div className="flex flex-wrap items-center gap-2 text-ink">
            <Combobox
              options={(forms.data ?? []).map((name) => ({ value: name, label: name }))}
              value=""
              onChange={(name) => {
                // The form replaces the part before "::", the rest of the name stays.
                const rest = fields.tag_name.includes("::")
                  ? fields.tag_name.slice(fields.tag_name.indexOf("::") + 2)
                  : fields.tag_name;
                set("tag_name", `${name}::${rest}`);
                document.getElementById("create-tag-name")?.focus();
              }}
              label={t("tags.create.formHelp.pick")}
              placeholder={t("tags.create.formHelp.pick")}
              emptyText={forms.isPending ? t("detail.loading") : t("tags.create.formHelp.noForm")}
              className="w-64"
            />
          </div>
        </div>
      </details>

      <form onSubmit={onSubmit} noValidate>
        <div className="mb-3">
          <label className="mb-1 block font-medium" htmlFor="create-tag-name">
            {t("tags.fields.tag_name")}
            <span className="text-state-down" aria-hidden="true">
              {" "}
              *
            </span>
            <span className="sr-only"> ({t("tags.create.required")})</span>
          </label>
          <input
            id="create-tag-name"
            required
            autoComplete="off"
            value={fields.tag_name}
            aria-describedby="create-tag-name-hint"
            onChange={(event) => {
              set("tag_name", event.target.value);
            }}
            className={`${INPUT} ${missingForm ? "border-state-warn" : "border-line"}`}
          />
          <p id="create-tag-name-hint" className="mt-1 text-ink-muted" aria-live="polite">
            {missingForm ? (
              <span className="text-state-warn">
                ▲ {t("tags.create.formHelp.missing", { form: formName })}
              </span>
            ) : (
              nameHint
            )}
          </p>
        </div>

        <div className="mb-3">
          <label className="mb-1 block font-medium" htmlFor="create-tag-exclude">
            {t("tags.fields.tag_exclude")}
          </label>
          <input
            id="create-tag-exclude"
            autoComplete="off"
            value={fields.tag_exclude}
            aria-invalid={invalid.exclude}
            aria-describedby="create-tag-exclude-hint"
            onChange={(event) => {
              set("tag_exclude", event.target.value);
            }}
            className={`${INPUT} ${invalid.exclude ? "border-state-down" : "border-line"}`}
          />
          <p id="create-tag-exclude-hint" className="mt-1 text-ink-muted">
            {invalid.exclude ? (
              <span className="text-state-down">■ {t("tags.create.excludeInvalid")}</span>
            ) : (
              t("tags.create.excludeHint")
            )}
          </p>
        </div>

        <div className="mb-3">
          <label className="mb-1 block font-medium" htmlFor="create-tag-data">
            {t("tags.fields.tag_data")}
          </label>
          <textarea
            id="create-tag-data"
            value={fields.tag_data}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="create-tag-data-hint"
            onChange={(event) => {
              set("tag_data", event.target.value);
            }}
            className="w-full rounded-(--radius-control) border border-line bg-surface p-2 font-mono text-data"
          />
          <p id="create-tag-data-hint" className="mt-1 text-ink-muted">
            {invalid.dataAsText
              ? t("tags.create.dataAsText")
              : t(
                  formName === null || missingForm
                    ? "tags.create.dataHint"
                    : "tags.create.formHelp.dataHint",
                  { form: formName },
                )}
          </p>
        </div>

        {create.isError && (
          <p role="alert" className="mb-3 text-state-down">
            ■ {create.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={create.isPending || fields.tag_name.trim() === "" || invalid.exclude}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {create.isPending ? t("tags.create.saving") : t("tags.create.save")}
        </button>
      </form>
    </SlideOver>
  );
}
