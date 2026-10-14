import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";

type CheckContextualRow = components["schemas"]["CheckContextualRow"];
type CheckContextualRequest = components["schemas"]["CheckContextualRequest"];

const text = (prop: keyof CheckContextualRow) => (row: CheckContextualRow) => {
  const value = row[prop];
  return value === undefined || value === null ? undefined : String(value);
};

function groups(editable: boolean): DetailGroup<CheckContextualRow>[] {
  return [
    {
      key: "scope",
      family: "state",
      fields: [
        linkedField<CheckContextualRow>(
          "gen_filtersets.fset_name",
          "filterset",
          (row) => (row.fset_id === undefined ? undefined : String(row.fset_id)),
          text("gen_filtersets.fset_name"),
        ),
        { prop: "chk_type", format: text("chk_type"), editable, input: "text" },
        { prop: "chk_instance", format: text("chk_instance"), editable, input: "text" },
        { prop: "id", format: text("id") },
      ],
    },
    {
      key: "thresholds",
      family: "alert",
      fields: [
        { prop: "chk_low", format: text("chk_low"), editable, input: "number" },
        { prop: "chk_high", format: text("chk_high"), editable, input: "number" },
      ],
    },
  ];
}

/** Body of the update: the properties changed, typed as the API takes them. */
function toBody(changes: Record<string, string | number | boolean>): CheckContextualRequest {
  const body: CheckContextualRequest = {};
  if (typeof changes.chk_type === "string") body.chk_type = changes.chk_type;
  if (typeof changes.chk_instance === "string") body.chk_instance = changes.chk_instance;
  if (typeof changes.chk_low === "number") body.chk_low = changes.chk_low;
  if (typeof changes.chk_high === "number") body.chk_high = changes.chk_high;
  return body;
}

/**
 * Contextual thresholds, edited in place by a ContextCheckManager, and deleted
 * from the foot of the panel; their filterset stays, another one is other
 * thresholds. The checks of the type take the change in the background, with
 * their alerts.
 */
export function CheckContextualDetailPanel({
  thresholdsId,
  label,
  onClose,
}: {
  thresholdsId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const privileges = useEffectivePrivileges();
  const allowed =
    privileges.data !== undefined && hasPrivilege(privileges.data, ["ContextCheckManager"]);
  const {
    data: row,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["check-contextual-one", thresholdsId],
    enabled: thresholdsId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/checks/contextual_settings", {
        params: {
          query: {
            props: "id,fset_id,gen_filtersets.fset_name,chk_type,chk_instance,chk_low,chk_high",
            filter: [`id:${thresholdsId ?? ""}`],
            limit: 1,
          },
        },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: CheckContextualRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["check-contextual"] });
    await queryClient.invalidateQueries({ queryKey: ["check-contextual-one", thresholdsId] });
  };
  const save = useMutation({
    mutationFn: async (changes: Record<string, string | number | boolean>) => {
      const { error: failure } = await api.POST("/checks/contextual_settings/{id}", {
        params: { path: { id: Number(thresholdsId) } },
        body: toBody(changes),
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error: failure } = await api.DELETE("/checks/contextual_settings/{id}", {
        params: { path: { id: Number(thresholdsId) } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const title =
    row?.chk_type === undefined
      ? label === ""
        ? t("checkContextual.detail.title")
        : label
      : `${row["gen_filtersets.fset_name"] ?? ""} ${row.chk_type}:${row.chk_instance ?? ""}`.trim();

  return (
    <DetailPanel
      kind="check"
      open={thresholdsId !== undefined}
      title={title}
      onClose={onClose}
      groups={groups(allowed)}
      row={row}
      onSave={allowed ? (changes) => save.mutateAsync(changes) : undefined}
      editHint={t("checkContextual.detail.editHint")}
      labelPrefix="checkContextual.fields"
      groupPrefix="checkContextual.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      after={
        allowed && row !== null && row !== undefined ? (
          <div className="mt-4">
            <ConfirmButton
              icon={<TrashIcon />}
              label={t("detail.delete")}
              question={t("checkContextual.detail.deleteQuestion")}
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
        ) : undefined
      }
    />
  );
}
