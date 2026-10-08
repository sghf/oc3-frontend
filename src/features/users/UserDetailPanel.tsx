import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel } from "@/components/opensvc/DetailPanel";
import { problemText } from "@/lib/api/problem";
import { useEffectiveUser, useImpersonation } from "@/lib/api/impersonation";
import { AlertTriangleIcon, UserIcon } from "@/components/ui/icons";
import { EDITABLE_USER_GROUPS, USER_PROPS_QUERY } from "./user-fields";
import { useSaveUser } from "./use-save-user";
import { useCanImpersonate, useImpersonate } from "./use-impersonate";
import { UserGroupsParts } from "./UserGroupsParts";
import { DeleteUser } from "./DeleteUser";

type UserRow = components["schemas"]["UserRow"];

/**
 * Detail of a user. The name and email carry a pencil: a user may change their
 * own, a UserManager anyone's, and the server refuses the others with a message
 * under the field — the interface does not know the caller's privileges yet.
 *
 * "Impersonate" acts as that user from then on, as in the historical collector,
 * for a Manager only. Not offered on oneself, nor while already acting as somebody
 * else.
 *
 * Under the properties, the organisational and privilege groups of the user,
 * which a GroupManager changes in place. At the foot, deleting the user, for a
 * UserManager (`DeleteUser`).
 */
export function UserDetailPanel({
  userId,
  label,
  onClose,
}: {
  userId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const effectiveUser = useEffectiveUser();
  const impersonation = useImpersonation();
  const {
    data: user,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["user", userId],
    enabled: userId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/users/{user_id}", {
        params: { path: { user_id: userId ?? "" }, query: { props: USER_PROPS_QUERY } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: UserRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  const isSelf =
    effectiveUser !== null &&
    user?.email !== undefined &&
    user.email.toLowerCase() === effectiveUser.toLowerCase();
  const save = useSaveUser(userId, isSelf);

  const allowed = useCanImpersonate();
  // Once started, the panel of the other identity has no reason to stay.
  const impersonate = useImpersonate(onClose);
  const canImpersonate =
    allowed && user !== null && user !== undefined && !isSelf && impersonation === null;

  return (
    <DetailPanel
      kind="user"
      recordId={userId}
      open={userId !== undefined}
      title={user?.email ?? (label === "" ? t("users.detail.title") : label)}
      onClose={onClose}
      groups={EDITABLE_USER_GROUPS}
      row={user}
      labelPrefix="users.fields"
      groupPrefix="users.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      onSave={save}
      editHint={t("users.detail.editHint")}
      actions={
        <div className="space-y-3">
          {userId !== undefined && <UserGroupsParts userId={userId} />}
          {canImpersonate && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={impersonate.isPending}
                onClick={() => {
                  impersonate.mutate(userId ?? "");
                }}
                title={t("impersonation.hint")}
                className="flex h-8 items-center gap-1.5 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken disabled:opacity-60"
              >
                <UserIcon />
                {t("impersonation.start")}
              </button>
              {impersonate.isError && (
                <p role="alert" className="flex items-center gap-1 text-state-down">
                  <AlertTriangleIcon className="shrink-0" />
                  {impersonate.error.message}
                </p>
              )}
            </div>
          )}
          {userId !== undefined && user !== null && user !== undefined && (
            <DeleteUser
              userId={userId}
              email={user.email ?? label}
              isSelf={isSelf}
              onDeleted={onClose}
            />
          )}
        </div>
      }
    />
  );
}
