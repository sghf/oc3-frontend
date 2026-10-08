import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { ChangeOutcomeLine, EditorPart, ObjectChips } from "@/components/opensvc/CompEditorParts";
import { useChanges } from "@/components/opensvc/comp-changes";
import { Combobox } from "@/components/ui/Combobox";
import { AlertTriangleIcon } from "@/components/ui/icons";
import {
  useAttachableGroups,
  useCanManageMemberships,
  useMembershipChanged,
  useUserGroups,
  type MemberGroup,
} from "./use-user-groups";

/**
 * The organisational and the privilege groups of a user, as the two membership
 * lists of the historical user properties (`user_org_membership`,
 * `user_priv_membership` in tags.js). A GroupManager adds and removes them in
 * place, each change written at once; a GroupManager who is not a Manager is
 * offered, and may attach, only the groups they are member of. `readOnly` only
 * lists them, whatever the privileges of the caller: the profile page shows the
 * caller's own groups, which are not changed from there.
 */
export function UserGroupsParts({
  userId,
  readOnly = false,
}: {
  userId: string;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const groups = useUserGroups(userId);
  const canManage = useCanManageMemberships();
  const editable = canManage && !readOnly;
  const candidates = useAttachableGroups(editable);
  const changed = useMembershipChanged();
  const { outcome, busy, change, dismiss } = useChanges(() => changed(userId));
  const own = groups.data ?? [];

  const part = (privilege: boolean) => {
    const kind = privilege ? "privilege" : "org";
    const members = own.filter((g) => g.privilege === privilege);
    const offered = (candidates.data ?? []).filter(
      (g) => g.privilege === privilege && !members.some((m) => m.id === g.id),
    );
    const idOf = (role: string) => members.find((g) => g.role === role)?.id;
    return (
      <EditorPart
        title={t(`users.detail.memberships.${kind}`)}
        count={members.length}
        actions={
          editable && (
            <Combobox
              options={offered.map((g: MemberGroup) => ({ value: String(g.id), label: g.role }))}
              value=""
              onChange={(id) => {
                const group = offered.find((g) => String(g.id) === id);
                if (group === undefined) return;
                void change(t("users.detail.memberships.added", { group: group.role }), () =>
                  api.POST("/users/{user_id}/groups/{group_id}", {
                    params: { path: { user_id: userId, group_id: id } },
                  }),
                );
              }}
              label={t(`users.detail.memberships.add.${kind}`)}
              placeholder={t(`users.detail.memberships.add.${kind}`)}
              emptyText={t("compEditor.noMatch")}
              className="w-56"
            />
          )
        }
      >
        <ObjectChips
          kind="group"
          names={members.map((g) => g.role)}
          linkId={(role) => {
            const id = idOf(role);
            return id === undefined ? undefined : String(id);
          }}
          empty={t(`users.detail.memberships.none.${kind}`)}
          removeLabel={(role) => t("users.detail.memberships.remove", { group: role })}
          onRemove={
            editable && !busy
              ? (role) => {
                  void change(t("users.detail.memberships.removed", { group: role }), () =>
                    api.DELETE("/users/{user_id}/groups/{group_id}", {
                      params: {
                        path: { user_id: userId, group_id: String(idOf(role) ?? role) },
                      },
                    }),
                  );
                }
              : undefined
          }
        />
      </EditorPart>
    );
  };

  return (
    <div className="space-y-3">
      <ChangeOutcomeLine outcome={outcome} onDismiss={dismiss} />
      {groups.isError && (
        <p role="alert" className="flex items-center gap-1 text-state-down">
          <AlertTriangleIcon className="shrink-0" />
          {groups.error.message}
        </p>
      )}
      {part(false)}
      {part(true)}
      {editable && <p className="text-ink-muted">{t("users.detail.memberships.hint")}</p>}
    </div>
  );
}
