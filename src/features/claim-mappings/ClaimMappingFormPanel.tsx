import { useEffect, useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { SlideOver } from "@/components/ui/SlideOver";
import { Combobox } from "@/components/ui/Combobox";
import { CloseIcon } from "@/components/ui/icons";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import {
  flattenClaims,
  useCurrentClaims,
  useGrantableTeams,
  type ClaimMappingRow,
} from "./claim-mapping-api";
import { EMPTY_DRAFT, draftOf, type ClaimMappingDraft } from "./claim-mapping-draft";

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

/**
 * Creating or editing a claim rule. The claim and its value are suggested from the
 * claims of the current sign-in, when it went through the identity provider; any
 * other name or value may be typed. A rule allows signing in, grants a team, or
 * both, and the form says what each does before saving: the teams a rule names
 * follow the claims, so an account not matching leaves them at its next sign-in.
 */
export function ClaimMappingFormPanel({
  open,
  mapping,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Rule to edit; absent, the form creates one. */
  mapping?: ClaimMappingRow | null;
  /** Starting values of a new rule, from a claim of the current sign-in. */
  initial?: Partial<ClaimMappingDraft>;
  onClose: () => void;
  onSaved?: (id: number | undefined) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const editing = mapping !== undefined && mapping !== null;
  const [draft, setDraft] = useState<ClaimMappingDraft>(EMPTY_DRAFT);
  const teams = useGrantableTeams();
  const claims = useCurrentClaims();
  const known = flattenClaims(claims.data?.claims ?? {});
  const knownValues = known.find(([name]) => name === draft.claim)?.[1] ?? [];

  // Every opening starts again from the rule to edit, or from the values given.
  useEffect(() => {
    if (open) setDraft(editing ? draftOf(mapping) : { ...EMPTY_DRAFT, ...initial });
    // `initial` is read on opening only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mapping]);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        claim: draft.claim,
        value: draft.value,
        allow_access: draft.allowAccess,
        group_ids: draft.groupIds,
      };
      const { data, error } = editing
        ? await api.POST("/oidc_mappings/{mapping_id}", {
            params: { path: { mapping_id: Number(mapping.id) } },
            body,
          })
        : await api.POST("/oidc_mappings", { body });
      if (error !== undefined) throw new Error(problemText(error));
      return Array.isArray(data.data) ? data.data[0]?.id : undefined;
    },
    onSuccess: async (savedId) => {
      await queryClient.invalidateQueries({ queryKey: ["claim-mappings"] });
      await queryClient.invalidateQueries({ queryKey: ["claim-mapping"] });
      onSaved?.(savedId);
      onClose();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  const noEffect = !draft.allowAccess && draft.groupIds.length === 0;
  // The teams chosen, in the order they were added, with their names.
  const chosen = draft.groupIds.map(
    (groupId) =>
      teams.data?.find((entry) => entry.id === groupId) ?? { id: groupId, role: String(groupId) },
  );
  const offered = (teams.data ?? []).filter((entry) => !draft.groupIds.includes(entry.id));

  return (
    <SlideOver
      // An existing rule being edited is not dropped by a stray click.
      closeOnOutsideClick={!editing}
      open={open}
      title={editing ? t("claimMappings.form.editTitle") : t("claimMappings.form.createTitle")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="claimMapping" />}
    >
      <p className="mb-3 text-ink-muted">{t("claimMappings.form.intro")}</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block font-medium" htmlFor={`${id}-claim`}>
            {t("claimMappings.fields.claim")}
          </label>
          <input
            id={`${id}-claim`}
            required
            maxLength={128}
            list={`${id}-claims`}
            value={draft.claim}
            onChange={(event) => {
              setDraft({ ...draft, claim: event.target.value });
            }}
            placeholder="groups"
            className={`${INPUT} font-mono`}
          />
          <datalist id={`${id}-claims`}>
            {known.map(([name]) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="mt-1 text-ink-muted">{t("claimMappings.form.claimHint")}</p>
        </div>

        <div>
          <label className="mb-1 block font-medium" htmlFor={`${id}-value`}>
            {t("claimMappings.fields.value")}
          </label>
          <input
            id={`${id}-value`}
            required
            maxLength={255}
            list={`${id}-values`}
            value={draft.value}
            onChange={(event) => {
              setDraft({ ...draft, value: event.target.value });
            }}
            className={`${INPUT} font-mono`}
          />
          <datalist id={`${id}-values`}>
            {knownValues.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <p className="mt-1 text-ink-muted">{t("claimMappings.form.valueHint")}</p>
        </div>

        <fieldset className="flex flex-col gap-3 rounded-(--radius-panel) border border-line p-3">
          <legend className="px-1 font-medium">{t("claimMappings.form.effects")}</legend>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={draft.allowAccess}
              onChange={(event) => {
                setDraft({ ...draft, allowAccess: event.target.checked });
              }}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{t("claimMappings.fields.allow_access")}</span>
              <span className="block text-ink-muted">{t("claimMappings.form.accessHint")}</span>
            </span>
          </label>

          <div>
            <p className="mb-1 font-medium">{t("claimMappings.fields.group_roles")}</p>
            {chosen.length > 0 && (
              <ul
                aria-label={t("claimMappings.fields.group_roles")}
                className="mb-2 flex flex-wrap gap-1.5"
              >
                {chosen.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex h-6 items-center gap-1 rounded-full border border-line bg-surface pr-0.5 pl-2"
                  >
                    {entry.role}
                    <button
                      type="button"
                      onClick={() => {
                        setDraft({
                          ...draft,
                          groupIds: draft.groupIds.filter((groupId) => groupId !== entry.id),
                        });
                      }}
                      title={t("claimMappings.form.removeTeam", { team: entry.role })}
                      className="rounded-full p-0.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
                    >
                      <CloseIcon className="h-3 w-3" />
                      <span className="sr-only">
                        {t("claimMappings.form.removeTeam", { team: entry.role })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Combobox
              options={offered.map((entry) => ({ value: String(entry.id), label: entry.role }))}
              // Picking a team adds it: the field is ready for the next one.
              value=""
              onChange={(value) => {
                if (value === "") return;
                setDraft({ ...draft, groupIds: [...draft.groupIds, Number(value)] });
              }}
              label={t("claimMappings.form.addTeam")}
              placeholder={t("claimMappings.form.addTeam")}
              emptyText={t("compEditor.noMatch")}
              className="w-64"
            />
            <p className="mt-1 text-ink-muted">{t("claimMappings.form.teamHint")}</p>
          </div>
        </fieldset>

        {chosen.length > 0 && (
          <p
            role="note"
            className="rounded-(--radius-panel) border border-state-warn bg-state-warn-soft p-2 text-ink"
          >
            <span aria-hidden="true" className="text-state-warn">
              ▲
            </span>{" "}
            {t("claimMappings.form.teamWarning", {
              count: chosen.length,
              teams: chosen.map((entry) => entry.role).join(", "),
            })}
          </p>
        )}

        {noEffect && (draft.claim !== "" || draft.value !== "") && (
          <p className="text-ink-muted">{t("claimMappings.form.noEffect")}</p>
        )}

        {save.isError && (
          <p role="alert" className="text-state-down">
            ■ {save.error.message}
          </p>
        )}

        <div>
          <button
            type="submit"
            disabled={save.isPending || noEffect}
            className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
          >
            {save.isPending
              ? t("claimMappings.form.saving")
              : editing
                ? t("claimMappings.form.saveEdit")
                : t("claimMappings.form.saveCreate")}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}
