import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChangeOutcomeLine, TeamsPart } from "@/components/opensvc/CompEditorParts";
import { useChanges } from "@/components/opensvc/comp-changes";
import { useComplianceGroups } from "@/features/designer/use-designer-data";
import { api } from "@/lib/api/client";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { useFormResponsible, useFormTeams } from "./form-admin-api";

/**
 * The groups a form is published to, whose members may submit it, and those
 * responsible for it, who may change it. A FormsManager responsible for the
 * form adds and removes them, as the API requires; each change is written at
 * once and its outcome told.
 */
export function FormTeams({ formId }: { formId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const teams = useFormTeams(formId);
  const groups = useComplianceGroups();
  const responsible = useFormResponsible(formId);
  const privileges = useEffectivePrivileges();
  const editable =
    responsible.data === true &&
    privileges.data !== undefined &&
    hasPrivilege(privileges.data, ["FormsManager"]);
  const { outcome, busy, change, dismiss } = useChanges(async () => {
    await queryClient.invalidateQueries({ queryKey: ["form", formId] });
    // The catalog of new requests follows the publications.
    await queryClient.invalidateQueries({ queryKey: ["forms"] });
  });

  if (teams.isPending) return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (teams.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {t("detail.error", { message: teams.error.message })}
      </p>
    );
  const path = (groupId: string) => ({ path: { form_id: Number(formId), group_id: groupId } });
  return (
    <div className="flex flex-col gap-2">
      <ChangeOutcomeLine outcome={outcome} onDismiss={dismiss} />
      <TeamsPart
        teams={teams.data}
        groups={groups.data ?? []}
        editable={editable}
        busy={busy}
        onAdd={(role, group, list) => {
          void change(t("compEditor.teamAdded", { team: group.role, list }), () =>
            role === "responsibles"
              ? api.POST("/forms/{form_id}/responsibles/{group_id}", {
                  params: path(String(group.id)),
                })
              : api.POST("/forms/{form_id}/publications/{group_id}", {
                  params: path(String(group.id)),
                }),
          );
        }}
        onRemove={(role, team, groupId, list) => {
          void change(t("compEditor.teamRemoved", { team, list }), () =>
            role === "responsibles"
              ? api.DELETE("/forms/{form_id}/responsibles/{group_id}", { params: path(groupId) })
              : api.DELETE("/forms/{form_id}/publications/{group_id}", { params: path(groupId) }),
          );
        }}
      />
      {!editable && responsible.isSuccess && privileges.isSuccess && (
        <p className="text-ink-muted">{t("forms.teams.readOnly")}</p>
      )}
    </div>
  );
}
