import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import {
  NAV_CATEGORIES,
  NAV_TOP,
  NAV_VIEWS,
  type MenuId,
  type NavEntry,
} from "@/app/layout/navigation";

/** The entries a group hides, by key. */
function useGroupHiddenEntries(groupId: string) {
  return useQuery({
    queryKey: ["group", groupId, "hiddenMenuEntries"],
    queryFn: async () => {
      const { data, error } = await api.GET("/groups/{group_id}/hidden_menu_entries", {
        params: { path: { group_id: groupId }, query: { props: "menu_entry", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? (data.data as { menu_entry?: string }[]) : [];
      return new Set(rows.flatMap((row) => (row.menu_entry === undefined ? [] : [row.menu_entry])));
    },
  });
}

/**
 * The menu entries an organizational group hides, the historical group tab "Hidden
 * menu entries": the whole menu, both views, by section, an entry shown or hidden
 * for the group. As in the historical collector, an entry is hidden to a user only
 * when every organizational group of the user hides it, the Everybody group and
 * the privilege groups apart; a privilege group hides nothing, so the section is
 * only a note there. A GroupManager changes them, each switch at once; the others
 * read them.
 */
export function GroupMenuEntries({
  groupId,
  role,
  privilege,
}: {
  groupId: string;
  role: string | undefined;
  /** The group is a privilege group, `privilege` "T". */
  privilege: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const privileges = useEffectivePrivileges();
  const editable = privileges.data !== undefined && hasPrivilege(privileges.data, ["GroupManager"]);
  const hidden = useGroupHiddenEntries(groupId);

  const toggle = useMutation({
    mutationFn: async ({ menuId, hide }: { menuId: MenuId; hide: boolean }) => {
      const params = { path: { group_id: groupId } };
      const body = { menu_entry: menuId };
      const { error } = hide
        ? await api.POST("/groups/{group_id}/hidden_menu_entries", { params, body })
        : await api.DELETE("/groups/{group_id}/hidden_menu_entries", { params, body });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group", groupId, "hiddenMenuEntries"] });
      // The menu of the user, should the group be one of theirs.
      await queryClient.invalidateQueries({ queryKey: ["user", "self", "hiddenMenuEntries"] });
    },
  });

  const entry = (item: NavEntry) => {
    const isHidden = hidden.data?.has(item.menuId) === true;
    const busy = toggle.isPending && toggle.variables.menuId === item.menuId;
    return (
      <li key={item.menuId} className="flex items-center gap-2 py-0.5">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="checkbox"
            checked={!isHidden}
            disabled={!editable || busy || hidden.isPending}
            onChange={(event) => {
              toggle.mutate({ menuId: item.menuId, hide: !event.target.checked });
            }}
          />
          <ObjectIcon kind={item.icon} className="h-3.5 w-3.5" />
          <span className="truncate">{t(item.labelKey)}</span>
        </label>
        {/* Said with a word, not by the box alone. */}
        <span className={isHidden ? "text-state-warn" : "text-ink-muted"}>
          {isHidden ? t("groups.menu.hidden") : t("groups.menu.shown")}
        </span>
      </li>
    );
  };

  return (
    <section aria-label={t("groups.menu.title")}>
      <h3 className="mb-1 font-semibold">{t("groups.menu.title")}</h3>
      {privilege ? (
        <p className="text-ink-muted">{t("groups.menu.privilegeGroup")}</p>
      ) : (
        <>
          <p className="mb-2 text-ink-muted">
            {t("groups.menu.intro", { role: role ?? "" })}
            {!editable && ` ${t("groups.menu.readOnly")}`}
          </p>
          {hidden.isError && (
            <p role="alert" className="mb-2 text-state-down">
              ■ {hidden.error.message}
            </p>
          )}
          {toggle.isError && (
            <p role="alert" className="mb-2 text-state-down">
              ■ {toggle.error.message}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {NAV_VIEWS.map((view) => (
              <div key={view}>
                <h4 className="mb-1 font-medium">{t(`nav.views.${view}`)}</h4>
                {view === "operator" && <ul>{NAV_TOP.map(entry)}</ul>}
                {NAV_CATEGORIES.filter((category) => category.view === view).map((category) => (
                  <div key={category.key} className="mt-1">
                    <p className="text-data font-semibold text-ink-muted uppercase">
                      {t(category.labelKey)}
                    </p>
                    <ul>{category.entries.map(entry)}</ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
