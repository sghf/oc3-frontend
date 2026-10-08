import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import { problemText } from "@/lib/api/problem";
import { GroupMembers } from "./GroupMembers";

type GroupRow = components["schemas"]["GroupRow"];

const GROUPS: DetailGroup<GroupRow>[] = [
  {
    key: "identity",
    family: "team",
    fields: [
      { prop: "role", format: (row) => row.role },
      // `privilege` is T or F in the database: shown as a switch, read-only.
      { prop: "privilege", format: (row) => row.privilege, input: "boolean" },
      { prop: "description", format: (row) => row.description },
      { prop: "id", format: (row) => (row.id === undefined ? undefined : String(row.id)) },
    ],
  },
];

export function GroupDetailPanel({
  groupId,
  label,
  onClose,
}: {
  groupId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    data: group,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["group", groupId],
    enabled: groupId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/groups/{group_id}", {
        params: { path: { group_id: groupId ?? "" } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: GroupRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  // Deletion cascades on the collector side: the group's memberships,
  // responsibilities and publications go with it. The "Everybody" group is immutable.
  const remove = useMutation({
    mutationFn: async () => {
      const { error: failure } = await api.DELETE("/groups/{group_id}", {
        params: { path: { group_id: groupId ?? "" } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      onClose();
    },
  });

  return (
    <DetailPanel
      kind="group"
      recordId={groupId}
      open={groupId !== undefined}
      title={group?.role ?? (label === "" ? t("groups.detail.title") : label)}
      onClose={onClose}
      groups={GROUPS}
      row={group}
      labelPrefix="groups.fields"
      groupPrefix="groups.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      actions={
        <div className="space-y-3">
          {groupId !== undefined && <GroupMembers groupId={groupId} />}
          <ConfirmButton
            icon={<TrashIcon />}
            label={t("detail.delete")}
            question={t("groups.delete.question", { role: group?.role ?? "" })}
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
      }
    />
  );
}
