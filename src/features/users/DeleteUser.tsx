import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import { useUserGroups } from "./use-user-groups";

/**
 * Deleting a user, at the foot of their panel. Offered as the server accepts it:
 * to a UserManager (a Manager having it too), never on one's own account, and on a
 * Manager's account to a Manager only. The confirmation says what goes with the
 * account and what stays; the server's refusal (the last Manager) shows under the
 * button.
 */
export function DeleteUser({
  userId,
  email,
  isSelf,
  onDeleted,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mine = useUserGroups("self");
  const theirs = useUserGroups(userId);
  const callerIsManager = mine.data?.some((g) => g.role === "Manager") ?? false;
  const callerMay = callerIsManager || (mine.data?.some((g) => g.role === "UserManager") ?? false);
  const targetIsManager = theirs.data?.some((g) => g.role === "Manager") ?? false;

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE("/users/{user_id}", {
        params: { path: { user_id: userId } },
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.removeQueries({ queryKey: ["user", userId] });
      onDeleted();
    },
  });

  if (isSelf || !callerMay || !theirs.isSuccess || (targetIsManager && !callerIsManager))
    return null;

  return (
    <div className="border-t border-line pt-3">
      <ConfirmButton
        icon={<TrashIcon />}
        label={t("users.delete.label")}
        question={t("users.delete.question", { email })}
        details={<p className="text-ink-muted">{t("users.delete.consequence")}</p>}
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
  );
}
