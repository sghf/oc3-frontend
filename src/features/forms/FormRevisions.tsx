import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DateTime } from "@/components/ui/DateTime";
import { UnifiedDiff } from "@/components/ui/UnifiedDiff";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import {
  revisionAuthor,
  rollbackForm,
  useFormDiff,
  useFormResponsible,
  useFormRevisions,
} from "./form-admin-api";

/**
 * The revisions of a form definition, the newest first: each with its date,
 * its author and, for a rollback, what it restored. A revision shows the change
 * it made; an earlier one is compared with the current definition and, by a
 * FormsManager responsible for the form, restored as a new revision, which
 * leaves every revision in the history.
 */
export function FormRevisions({ formId }: { formId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const revisions = useFormRevisions(formId);
  const responsible = useFormResponsible(formId);
  const privileges = useEffectivePrivileges();
  const editable =
    responsible.data === true &&
    privileges.data !== undefined &&
    hasPrivilege(privileges.data, ["FormsManager"]);
  // The revision shown, and how: the change it made, or compared with the current one.
  const [shown, setShown] = useState<{ cid: string; mode: "change" | "compare" } | null>(null);
  const restore = useMutation({
    mutationFn: (cid: string) => rollbackForm(formId, cid),
    onSuccess: async () => {
      setShown(null);
      await queryClient.invalidateQueries({ queryKey: ["form", formId] });
      await queryClient.invalidateQueries({ queryKey: ["forms"] });
    },
  });

  if (revisions.isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (revisions.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {t("detail.error", { message: revisions.error.message })}
      </p>
    );
  const list = revisions.data;
  if (list.length === 0) return <p className="text-ink-muted">{t("forms.revisions.empty")}</p>;
  const current = list[0]?.cid;
  const toggle = (cid: string, mode: "change" | "compare") => {
    setShown(shown?.cid === cid && shown.mode === mode ? null : { cid, mode });
  };

  return (
    <div className="flex flex-col gap-2">
      {restore.isError && (
        <p role="alert" className="text-state-down">
          ■ {restore.error.message}
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {list.map((revision) => {
          const { author, note } = revisionAuthor(revision);
          const isCurrent = revision.cid === current;
          return (
            <li key={revision.cid} className="flex flex-col gap-1">
              <span className="text-ink-muted">
                <span className="font-medium text-ink">
                  <DateTime value={revision.start.replace("T", " ")} />
                </span>
                {author !== "" && <> · {author}</>} ·{" "}
                <span className="font-mono">{revision.cid.slice(0, 12)}</span>
                {isCurrent && <> · {t("forms.revisions.current")}</>}
              </span>
              {note !== "" && <span className="text-ink-muted">{note}</span>}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  aria-expanded={shown?.cid === revision.cid && shown.mode === "change"}
                  onClick={() => {
                    toggle(revision.cid, "change");
                  }}
                  className="text-accent hover:underline"
                >
                  {t("forms.revisions.change")}
                </button>
                {!isCurrent && current !== undefined && (
                  <button
                    type="button"
                    aria-expanded={shown?.cid === revision.cid && shown.mode === "compare"}
                    onClick={() => {
                      toggle(revision.cid, "compare");
                    }}
                    className="text-accent hover:underline"
                  >
                    {t("forms.revisions.compare")}
                  </button>
                )}
                {!isCurrent && editable && (
                  <ConfirmButton
                    label={t("forms.revisions.restore")}
                    question={t("forms.revisions.restoreQuestion", {
                      version: revision.cid.slice(0, 12),
                    })}
                    confirmLabel={t("forms.revisions.restoreConfirm")}
                    cancelLabel={t("detail.cancel")}
                    pendingLabel={t("forms.revisions.restoring")}
                    pending={restore.isPending}
                    inline
                    onConfirm={() => {
                      restore.mutate(revision.cid);
                    }}
                  />
                )}
              </div>
              {shown?.cid === revision.cid && (
                <RevisionDiff
                  formId={formId}
                  cid={revision.cid}
                  other={shown.mode === "compare" ? current : undefined}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The change of a revision, or its differences with `other`. */
function RevisionDiff({ formId, cid, other }: { formId: string; cid: string; other?: string }) {
  const { t } = useTranslation();
  const diff = useFormDiff(formId, cid, other);
  if (diff.isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (diff.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {diff.error.message}
      </p>
    );
  // From the first hunk: git prints the commit, its stat and the file names
  // before, which the diff view would read as lines.
  const start = diff.data.search(/^@@/m);
  if (start < 0) return <p className="text-ink-muted">{t("forms.revisions.same")}</p>;
  const hunks = diff.data.slice(start).trimEnd();
  return (
    <div className="flex flex-col gap-1 rounded-(--radius-panel) border border-line p-2">
      {other !== undefined && (
        <p className="text-ink-muted">
          {t("forms.revisions.since", { version: cid.slice(0, 12) })}
        </p>
      )}
      <UnifiedDiff
        diff={hunks}
        labels={{
          added: t("compModules.history.added"),
          removed: t("compModules.history.removed"),
          showAll: (count) => t("compModules.history.showAll", { count }),
        }}
      />
    </div>
  );
}
