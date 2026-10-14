import type { components } from "@/lib/api/schema";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { useUserGroups } from "@/features/users/use-user-groups";

type GroupRow = components["schemas"]["GroupRow"];

export interface GroupRights {
  /** Rename the group, change its description, delete it. */
  edit: boolean;
  /** Make it a privilege group or an organizational one. */
  privilege: boolean;
  /** Add and remove its members. */
  members: boolean;
}

const NONE: GroupRights = { edit: false, privilege: false, members: false };

/**
 * What the caller may do with a group, as oc3 checks it: a Manager changes any
 * group but Everybody; a GroupManager who is not a Manager, the organizational
 * groups they are member of, and the members of any group they are member of. The
 * privilege flag is for a Manager only.
 */
export function useGroupRights(group: GroupRow | null | undefined): GroupRights {
  const privileges = useEffectivePrivileges();
  const own = useUserGroups("self");
  if (group?.id === undefined || privileges.data === undefined || own.data === undefined)
    return NONE;
  if (group.role === "Everybody") return NONE;
  const manager = privileges.data.has("Manager");
  if (!hasPrivilege(privileges.data, ["GroupManager"])) return NONE;
  const member = own.data.some((g) => g.id === group.id);
  const privilegeGroup = group.privilege === "T";
  return {
    edit: manager || (member && !privilegeGroup),
    privilege: manager,
    members: manager || member,
  };
}
