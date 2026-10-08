import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/format";
import { useClaimMapping, type ClaimMappingRow } from "./claim-mapping-api";
import { TeamBadges } from "./TeamBadges";

const text = (prop: keyof ClaimMappingRow) => (row: ClaimMappingRow) => {
  const value = row[prop];
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

/**
 * A claim rule: the claim and the value it matches, what it does, who changed it
 * last, the privilege groups and the organizational groups it grants apart, as in
 * the list. Editing opens the form; deleting asks first, and says what becomes of
 * the memberships the rule granted.
 */
export function ClaimMappingDetailPanel({
  mappingId,
  label,
  onClose,
  onEdit,
}: {
  mappingId: string | undefined;
  label: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: mapping, isPending, isError, error } = useClaimMapping(mappingId);

  const groups: DetailGroup<ClaimMappingRow>[] = [
    {
      key: "rule",
      family: "state",
      fields: [
        { prop: "claim", format: text("claim") },
        { prop: "value", format: text("value") },
        {
          prop: "allow_access",
          format: (row) =>
            row.allow_access === "T" ? t("claimMappings.detail.yes") : t("claimMappings.detail.no"),
        },
        // The privileges and the organizational groups apart, with the badges of
        // the list, each opening its group.
        {
          prop: "privilege_roles",
          format: (row) =>
            row.privilege_roles === undefined || row.privilege_roles === ""
              ? t("claimMappings.detail.noPrivilege")
              : row.privilege_roles,
          render: (row) =>
            row.privilege_roles === undefined || row.privilege_roles === "" ? (
              t("claimMappings.detail.noPrivilege")
            ) : (
              <TeamBadges row={row} kind="privilege" />
            ),
        },
        {
          prop: "org_roles",
          format: (row) =>
            row.org_roles === undefined || row.org_roles === ""
              ? t("claimMappings.detail.noOrg")
              : row.org_roles,
          render: (row) =>
            row.org_roles === undefined || row.org_roles === "" ? (
              t("claimMappings.detail.noOrg")
            ) : (
              <TeamBadges row={row} kind="org" />
            ),
        },
      ],
    },
    {
      key: "record",
      family: "time",
      fields: [
        { prop: "author", format: text("author") },
        { prop: "updated", format: (row, locale) => formatDateTime(row.updated, locale) },
        { prop: "id", format: text("id") },
      ],
    },
  ];

  const remove = useMutation({
    mutationFn: async () => {
      const { error: failure } = await api.DELETE("/oidc_mappings/{mapping_id}", {
        params: { path: { mapping_id: Number(mappingId) } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["claim-mappings"] });
      await queryClient.invalidateQueries({ queryKey: ["claim-mapping"] });
      onClose();
    },
  });

  const title =
    mapping === undefined || mapping === null
      ? label === ""
        ? t("claimMappings.detail.title")
        : label
      : `${mapping.claim ?? ""} = ${mapping.value ?? ""}`;

  return (
    <DetailPanel
      kind="claimMapping"
      open={mappingId !== undefined}
      title={title}
      onClose={onClose}
      groups={groups}
      row={mapping}
      labelPrefix="claimMappings.fields"
      groupPrefix="claimMappings.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      actions={
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-8 items-center gap-1.5 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
          >
            <PencilIcon />
            {t("claimMappings.form.edit")}
          </button>
          <div>
            <ConfirmButton
              icon={<TrashIcon />}
              label={t("detail.delete")}
              question={t("claimMappings.delete.question", {
                rule: `${mapping?.claim ?? ""} = ${mapping?.value ?? ""}`,
              })}
              details={<p className="text-ink-muted">{t("claimMappings.delete.consequence")}</p>}
              confirmLabel={t("detail.deleteConfirm")}
              cancelLabel={t("detail.cancel")}
              pendingLabel={t("detail.deleting")}
              pending={remove.isPending}
              onConfirm={() => {
                remove.mutate();
              }}
            />
            {remove.isError && (
              <p role="alert" className="mt-2 text-state-down">
                ■ {remove.error.message}
              </p>
            )}
          </div>
        </div>
      }
    />
  );
}
