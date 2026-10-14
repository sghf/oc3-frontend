import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";

type CheckDefaultRow = components["schemas"]["CheckDefaultRow"];
type CheckDefaultRequest = components["schemas"]["CheckDefaultRequest"];

const text = (prop: keyof CheckDefaultRow) => (row: CheckDefaultRow) => {
  const value = row[prop];
  return value === undefined || value === null ? undefined : String(value);
};

function groups(editable: boolean): DetailGroup<CheckDefaultRow>[] {
  return [
    {
      key: "scope",
      family: "state",
      fields: [
        { prop: "chk_type", format: text("chk_type"), editable, input: "text" },
        { prop: "chk_inst", format: text("chk_inst"), editable, input: "text" },
        { prop: "chk_prio", format: text("chk_prio"), editable, input: "number" },
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
function toBody(changes: Record<string, string | number | boolean>): CheckDefaultRequest {
  const body: CheckDefaultRequest = {};
  if (typeof changes.chk_type === "string") body.chk_type = changes.chk_type;
  if (typeof changes.chk_inst === "string") body.chk_inst = changes.chk_inst;
  if (typeof changes.chk_prio === "number") body.chk_prio = changes.chk_prio;
  if (typeof changes.chk_low === "number") body.chk_low = changes.chk_low;
  if (typeof changes.chk_high === "number") body.chk_high = changes.chk_high;
  return body;
}

/**
 * Default thresholds of a check type, edited in place by a CheckManager, and
 * deleted from the foot of the panel. The checks of the type take the change in
 * the background, with their alerts.
 */
export function CheckDefaultDetailPanel({
  defaultId,
  label,
  onClose,
}: {
  defaultId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const privileges = useEffectivePrivileges();
  const allowed = privileges.data !== undefined && hasPrivilege(privileges.data, ["CheckManager"]);
  const {
    data: row,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["check-default", defaultId],
    enabled: defaultId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/checks/defaults", {
        params: { query: { filter: [`id:${defaultId ?? ""}`], limit: 1 } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: CheckDefaultRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["check-defaults"] });
    await queryClient.invalidateQueries({ queryKey: ["check-default", defaultId] });
  };
  const save = useMutation({
    mutationFn: async (changes: Record<string, string | number | boolean>) => {
      const { error: failure } = await api.POST("/checks/defaults/{id}", {
        params: { path: { id: Number(defaultId) } },
        body: toBody(changes),
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error: failure } = await api.DELETE("/checks/defaults/{id}", {
        params: { path: { id: Number(defaultId) } },
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
        ? t("checkDefaults.detail.title")
        : label
      : `${row.chk_type}${row.chk_inst === undefined || row.chk_inst === "" ? "" : `:${row.chk_inst}`}`;

  return (
    <DetailPanel
      kind="check"
      open={defaultId !== undefined}
      title={title}
      onClose={onClose}
      groups={groups(allowed)}
      row={row}
      onSave={allowed ? (changes) => save.mutateAsync(changes) : undefined}
      editHint={t("checkDefaults.detail.editHint")}
      labelPrefix="checkDefaults.fields"
      groupPrefix="checkDefaults.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      after={
        allowed && row !== null && row !== undefined ? (
          <div className="mt-4">
            <ConfirmButton
              icon={<TrashIcon />}
              label={t("detail.delete")}
              question={t("checkDefaults.detail.deleteQuestion")}
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
