import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SlideOver } from "@/components/ui/SlideOver";
import { TabList, type TabItem } from "@/components/ui/Tabs";
import { tabPanelProps, useTabsId } from "@/components/ui/tabs-ids";
import { ColumnFamilyIcon, type ColumnFamily } from "./ColumnFamily";
import type { ObjectKind } from "./ObjectIcon";
import { RelatedCount } from "./RelatedCount";
import { BookmarkButton } from "./BookmarkButton";
import { BOOKMARK_KINDS } from "./bookmark-kinds";
import { FlashScope } from "./Flash";
import { PanelTitle } from "./PanelTitle";
import { PROPERTIES_TAB, type RelatedTab, type RelatedTabGroup } from "./related-tabs";
import { RelatedTileNav, type ResolvedGroup } from "./RelatedTileNav";

/**
 * Detail panel with tabs: the properties of the object, then its related data, one
 * tab each with its count. The open tab is held by the view, in the URL (`tab`), so
 * that a link, a reload or the Back button reopen it.
 *
 * With `groups`, the tab bar gives way to tiles always on display, a box per
 * group (`RelatedTileNav`). The URL still names the tab.
 */
export function RelatedTabsPanel({
  open,
  title,
  kind,
  onClose,
  objectId,
  tabs,
  groups,
  tab,
  onTabChange,
  propertiesFamily,
  label,
  titleActions,
  children,
}: {
  open: boolean;
  title: string;
  kind: ObjectKind;
  onClose: () => void;
  /** Id passed to the tabs; absent as long as nothing is selected. */
  objectId: string | undefined;
  tabs: RelatedTab[];
  /** The tabs gathered in boxes of tiles; none, a tab bar. */
  groups?: RelatedTabGroup[];
  tab: string | undefined;
  onTabChange: (tab: string | undefined) => void;
  /** Icon of the properties tab. */
  propertiesFamily: ColumnFamily;
  /** Accessible name of the tab bar. */
  label: string;
  /** The actions on the object, beside its title in the header, whatever the tab. */
  titleActions?: ReactNode;
  /** Content of the properties tab. */
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const tabsId = useTabsId();
  // An unknown tab, coming from an old URL or from another kind of object, falls back
  // to the properties.
  const related = tabs.find((entry) => entry.key === tab);
  const active = related?.key ?? PROPERTIES_TAB;
  // The groups with the tabs the panel has, those it lacks skipped.
  const resolved: ResolvedGroup[] = (groups ?? [])
    .map((group) => ({
      ...group,
      entries: group.tabs.flatMap((key) => tabs.filter((entry) => entry.key === key)),
    }))
    .filter((group) => group.entries.length > 0);
  const items: TabItem[] = [
    {
      key: PROPERTIES_TAB,
      label: t("related.properties"),
      icon: <ColumnFamilyIcon family={propertiesFamily} />,
    },
    ...tabs.map((entry) => ({
      key: entry.key,
      label: t(entry.labelKey),
      icon: entry.icon,
      badge: <RelatedCount tab={entry} id={objectId} active={entry.key === active} />,
    })),
  ];

  return (
    <SlideOver
      open={open}
      // The tab bar lists every kind of related data: a node has six tabs, with counts.
      size="wider"
      title={title}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      heading={
        <PanelTitle
          kind={kind}
          title={title}
          recordId={objectId}
          open={open}
          actions={titleActions}
        />
      }
      reopenable
      actions={
        objectId !== undefined && BOOKMARK_KINDS.has(kind) ? (
          <BookmarkButton kind={kind} id={objectId} />
        ) : undefined
      }
      subheader={
        groups === undefined ? (
          <TabList
            tabs={items}
            active={active}
            onChange={(key) => {
              onTabChange(key === PROPERTIES_TAB ? undefined : key);
            }}
            label={label}
            idPrefix={tabsId}
          />
        ) : (
          <RelatedTileNav
            groups={resolved}
            active={active}
            objectId={objectId}
            onSelect={onTabChange}
            label={label}
            propertiesIcon={<ColumnFamilyIcon family={propertiesFamily} />}
          />
        )
      }
    >
      {/* Another record or another tab brings other data, which is not an update to flash. */}
      <FlashScope subject={`${kind}:${objectId ?? ""}:${active}`}>
        <div
          // Grouped, the tiles are buttons, not tabs: the content is a region named
          // after the tab on display.
          {...(groups === undefined
            ? tabPanelProps(tabsId, active)
            : {
                role: "region",
                "aria-label": related === undefined ? t("related.properties") : t(related.labelKey),
              })}
          className="outline-none"
        >
          {related === undefined || objectId === undefined
            ? children
            : related.render(objectId, i18n.language)}
        </div>
      </FlashScope>
    </SlideOver>
  );
}
