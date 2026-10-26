import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseDefinition } from "./form-engine";
import { LegacyCssIcon } from "@/components/opensvc/LegacyCssIcon";
import { FormRender } from "./FormRender";
import { useForm } from "./use-form";
import { useFormUser } from "./use-form-user";

/**
 * The form as its users will see it: rendered from its stored definition, filled
 * and checked as for real, candidates fetched from the API. The submission is
 * not sent: the preview shows the data it would carry, since a form's outputs
 * change the collector (database rows, API calls, scripts, mails, workflows).
 */
export function FormPreview({ formId }: { formId: string }) {
  const { t } = useTranslation();
  const form = useForm(formId);
  const user = useFormUser();
  const def = useMemo(() => parseDefinition(form.data?.form_definition), [form.data]);
  const [submitted, setSubmitted] = useState<string | null>(null);

  if (form.isPending || user.isPending)
    return <p className="text-ink-muted">{t("list.loading")}</p>;
  if (form.isError) return <p className="text-state-down">■ {form.error.message}</p>;
  if (user.isError) return <p className="text-state-down">■ {user.error.message}</p>;
  if (def === null) {
    return (
      <p className="text-ink-muted">
        {form.data?.form_yaml ? t("forms.preview.unparsable") : t("forms.detail.noDefinition")}
      </p>
    );
  }
  if (def.output === null) return <p className="text-ink-muted">{t("forms.preview.noOutput")}</p>;

  return (
    <div>
      <p className="mb-3 rounded-(--radius-control) border border-line bg-surface-sunken px-3 py-2 text-ink-muted">
        {t("forms.preview.notice")}
      </p>
      {(def.label !== "" || def.desc !== "") && (
        <div className="mb-4">
          {def.label !== "" && (
            <h3 className="flex items-center gap-2 font-semibold text-ink">
              <LegacyCssIcon css={def.css} className="h-5 w-5" />
              {def.label}
            </h3>
          )}
          {def.desc !== "" && <p className="whitespace-pre-line text-ink-muted">{def.desc}</p>}
        </div>
      )}
      <FormRender
        // A new definition starts a new form rather than keeping stale values.
        key={JSON.stringify(form.data?.form_definition ?? null)}
        def={def}
        formId={form.data?.id}
        user={user.data}
        onSubmit={(data) => {
          setSubmitted(JSON.stringify(data, null, 2));
        }}
        submitLabel={t("forms.preview.submit")}
      />
      {submitted !== null && (
        <div className="mt-4" role="status">
          <p className="mb-1 font-medium text-ink">{t("forms.preview.submitted")}</p>
          <pre className="max-h-80 overflow-auto rounded-(--radius-control) border border-line bg-surface-sunken p-2 text-data">
            {submitted}
          </pre>
        </div>
      )}
    </div>
  );
}
