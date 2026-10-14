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
import { useGroupRights, type GroupRights } from "./group-rights";

type GroupRow = components["schemas"]["GroupRow"];

function groups(rights: GroupRights): DetailGroup<GroupRow>[] {
  return [
    {
      key: "identity",
      family: "team",
      fields: [
        { prop: "role", format: (row) => row.role, editable: rights.edit },
        // `privilege` is T or F in the database: shown as a switch.
        {
          prop: "privilege",
          format: (row) => row.privilege,
          input: "boolean",
          editable: rights.edit && rights.privilege,
        },
        { prop: "description", format: (row) => row.description, editable: rights.edit },
        { prop: "id", format: (row) => (row.id === undefined ? undefined : String(row.id)) },
      ],
    },
  ];
}

/**
 * A group: its properties, members and deletion, and, for an organizational group,
 * the Menu tab of the entries it hides. A GroupManager renames the group, changes
 * its description, its members, and deletes it, within the rights of
 * `useGroupRights`; a Manager also switches it between privilege and
 * organizational group.
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
  const rights = useGroupRights(group);

  // The API trims the name and refuses an empty one or one carried by another
  // group; its reason is shown under the field.
  const save = useMutation({
    mutationFn: async (changes: Record<string, string | number | boolean>) => {
      const body: { role?: string; description?: string; privilege?: string } = {};
      if (typeof changes.role === "string") body.role = changes.role;
      if (typeof changes.description === "string") body.description = changes.description;
      if (typeof changes.privilege === "boolean") body.privilege = changes.privilege ? "T" : "F";
      const { error: failure } = await api.POST("/groups/{group_id}", {
        params: { path: { group_id: groupId ?? "" } },
        body,
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    // A rename shows in the lists of groups, the groups of the users, and the
    // privileges of the caller when the group is one of theirs.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["groups"] }),
        queryClient.invalidateQueries({ queryKey: ["group", groupId] }),
        queryClient.invalidateQueries({ queryKey: ["user"] }),
      ]),
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
        groups={groups(rights)}
        // The switch reads the raw flag: an empty one, as oc3 wrote it for a group
        // created without one, is F.
        row={
          group === null || group === undefined
            ? group
            : { ...group, privilege: privilege ? "T" : "F" }
        }
        onSave={rights.edit ? (changes) => save.mutateAsync(changes) : undefined}
        labelPrefix="groups.fields"
        groupPrefix="groups.detail.groups"
        isPending={groupId !== undefined && isPending}
        errorMessage={isError ? error.message : null}
        editHint={rights.edit ? t("groups.detail.editHint") : ""}
      />
      <div className="mt-4 space-y-3">
        {groupId !== undefined && <GroupMembers groupId={groupId} editable={rights.members} />}
        {rights.edit && (
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
        )}
        {remove.isError && (
          <p role="alert" className="mt-2 text-state-down">
            ■ {remove.error.message}
          </p>
        )}
      </div>
    </RelatedTabsPanel>
  );
}
