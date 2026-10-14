import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailContent, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { RelatedTabsPanel } from "@/components/opensvc/RelatedTabsPanel";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import { problemText } from "@/lib/api/problem";
import { GroupMembers } from "./GroupMembers";
import { useGroup } from "./group-hidden-entries";
import { groupTabs } from "./group-related";

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

/**
 * A group: its properties, members and deletion, and, for an organizational group,
 * the Menu tab of the entries it hides.
 * The open tab is held by the view, in the URL (`tab`), as for the other panels.
 */
export function GroupDetailPanel({
  groupId,
  label,
  onClose,
  tab,
  onTabChange,
}: {
  groupId: string | undefined;
  label: string;
  onClose: () => void;
  tab?: string;
  onTabChange?: (tab: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: group, isPending, isError, error } = useGroup(groupId);
  // Without a view holding it, the tab lives here.
  const [localTab, setLocalTab] = useState<string | undefined>(undefined);
  const activeTab = onTabChange === undefined ? localTab : tab;
  const changeTab = onTabChange ?? setLocalTab;
  const privilege = group?.privilege === "T";

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
    <RelatedTabsPanel
      open={groupId !== undefined}
      title={group?.role ?? (label === "" ? t("groups.detail.title") : label)}
      kind="group"
      onClose={onClose}
      objectId={groupId}
      tabs={groupTabs(privilege)}
      tab={activeTab}
      onTabChange={changeTab}
      propertiesFamily="team"
      label={t("groups.related.label")}
    >
      <DetailContent
        groups={GROUPS}
        row={group}
        labelPrefix="groups.fields"
        groupPrefix="groups.detail.groups"
        isPending={groupId !== undefined && isPending}
        errorMessage={isError ? error.message : null}
        editHint=""
      />
      <div className="mt-4 space-y-3">
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
    </RelatedTabsPanel>
  );
}
