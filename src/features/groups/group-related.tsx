import { useTranslation } from "react-i18next";
import type { RelatedTab } from "@/components/opensvc/related-tabs";
import { SidebarIcon } from "@/components/ui/icons";
import { NAV_CATEGORIES, NAV_TOP } from "@/app/layout/navigation";
import { GroupMenuTab } from "./GroupMenuEntries";
import { useGroupHiddenEntries } from "./group-hidden-entries";

/** Every entry of the menu, both views, as the side menu lists them. */
const MENU_IDS = [...NAV_TOP, ...NAV_CATEGORIES.flatMap((category) => category.entries)].map(
  (entry) => entry.menuId,
);

/**
 * The Menu tab of a group's panel, with two counters: the entries of the menu the
 * group shows, then those it hides, both on display at zero.
 */
const MENU_TAB: RelatedTab = {
  key: "menu",
  labelKey: "groups.menu.tab",
  icon: <SidebarIcon className="h-4 w-4 shrink-0 text-icon-group" />,
  useSummary: (groupId) => {
    const { t } = useTranslation();
    const hiddenSet = useGroupHiddenEntries(groupId).data;
    if (hiddenSet === undefined) return { count: undefined };
    const hidden = MENU_IDS.filter((menuId) => hiddenSet.has(menuId)).length;
    const visible = MENU_IDS.length - hidden;
    return {
      count: MENU_IDS.length,
      keepEmptyParts: true,
      parts: [
        {
          key: "visible",
          count: visible,
          box: "bg-surface-sunken text-ink",
          label: t("groups.menu.visibleCount", { count: visible }),
        },
        {
          key: "hidden",
          count: hidden,
          box: "bg-state-warn-soft text-state-warn",
          label: t("groups.menu.hiddenCount", { count: hidden }),
        },
      ],
    };
  },
  render: (groupId) => <GroupMenuTab groupId={groupId} />,
};

/**
 * The tabs of a group's panel: the menu entries it hides, for an organizational
 * group only, a privilege group hiding none.
 */
export function groupTabs(privilege: boolean): RelatedTab[] {
  return privilege ? [] : [MENU_TAB];
}
