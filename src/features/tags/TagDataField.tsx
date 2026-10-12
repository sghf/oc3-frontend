import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormRender } from "@/features/forms/FormRender";
import { FormValue } from "@/features/forms/FormValue";
import { useFormDefinitionByName } from "@/features/forms/use-form";
import { useFormUser } from "@/features/forms/use-form-user";
import { PencilIcon } from "@/components/ui/icons";
import { parseTagData, tagDataText } from "./tag-form";

const BUTTON =
  "inline-flex h-7 items-center gap-1 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted hover:border-line-strong hover:text-ink";

/**
 * The data of a tag, or of one of its attachments: laid out by the tag's form when
 * it is form-based (`formName`), as JSON or text otherwise. With `onSave`, an edit
 * button opens the form, or a text field when there is no form to fill, as the
 * historical collector's tag data cells. `onSave` resolves to the refusal of the
 * collector, or null.
 */
export function TagDataField({
  formName,
  value,
  onSave,
  startEditing = false,
  onEditingChange,
}: {
  formName: string | null;
  value: string;
  onSave?: (text: string) => Promise<string | null>;
  /** Opens the editor at once, for a form-based tag just attached. */
  startEditing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditingState] = useState(startEditing);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  function setEditing(next: boolean) {
    setEditingState(next);
    setError(null);
    onEditingChange?.(next);
  }
  async function save(text: string) {
    if (onSave === undefined) return;
    setSaving(true);
    const refused = await onSave(text);
    setSaving(false);
    if (refused === null) setEditing(false);
    else setError(refused);
  }

  if (editing && onSave !== undefined)
    return (
      <TagDataEditor
        formName={formName}
        value={value}
        saving={saving}
        error={error}
        onSave={(text) => void save(text)}
        onCancel={() => {
          setEditing(false);
        }}
      />
    );
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        {value === "" ? (
          <p className="text-ink-muted">{t("tags.data.none")}</p>
        ) : formName === null ? (
          <pre className="m-0 rounded-(--radius-control) border border-line bg-surface-sunken p-2 font-mono text-data break-all whitespace-pre-wrap">
            {value}
          </pre>
        ) : (
          <FormValue formName={formName} value={value} digest />
        )}
      </div>
      {onSave !== undefined && (
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setEditing(true);
          }}
        >
          <PencilIcon className="h-3.5 w-3.5" />
          {t("tags.data.edit")}
        </button>
      )}
    </div>
  );
}

/**
 * The form of a form-based tag, filled with the stored data; a text field when the
 * tag has no form, or its form cannot be read.
 */
function TagDataEditor({
  formName,
  value,
  saving,
  error,
  onSave,
  onCancel,
}: {
  formName: string | null;
  value: string;
  saving: boolean;
  error: string | null;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const form = useFormDefinitionByName(formName ?? "");
  const user = useFormUser();
  const [raw, setRaw] = useState(value);
  const cancel = (
    <button type="button" className={BUTTON} onClick={onCancel} disabled={saving}>
      {t("detail.cancel")}
    </button>
  );
  const refusal =
    error === null ? null : (
      <p role="alert" className="mt-2 text-state-down">
        ■ {error}
      </p>
    );
  if (formName !== null && (form.isPending || user.isPending))
    return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (formName === null || form.data === null || form.data === undefined || user.data === undefined)
    return (
      <div className="flex flex-col gap-2 rounded-(--radius-control) border border-accent p-2">
        {formName !== null && (
          <p className="text-ink-muted">{t("tags.data.noForm", { form: formName })}</p>
        )}
        <label className="block">
          <span className="mb-1 block text-ink-muted">{t("tags.data.raw")}</span>
          <textarea
            autoFocus
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
            }}
            rows={Math.min(12, Math.max(3, raw.split("\n").length))}
            className="w-full rounded-(--radius-control) border border-line bg-surface p-2 font-mono text-data"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
            onClick={() => {
              onSave(raw);
            }}
          >
            {saving ? t("tags.data.saving") : t("tags.data.save")}
          </button>
          {cancel}
        </div>
        {refusal}
      </div>
    );
  return (
    <div className="rounded-(--radius-control) border border-accent p-2">
      <FormRender
        def={form.data}
        user={user.data}
        initialData={parseTagData(value)}
        submitLabel={saving ? t("tags.data.saving") : t("tags.data.save")}
        secondaryAction={cancel}
        onSubmit={(data) => {
          onSave(tagDataText(data));
        }}
      />
      {refusal}
    </div>
  );
}
