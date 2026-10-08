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
import { PanelHistoryRail } from "./PanelHistory";
import { FlashScope } from "./Flash";
import { PanelTitle } from "./PanelTitle";
import { recordKey } from "./panel-history";
import { PROPERTIES_TAB, type RelatedTab } from "./related-tabs";

/**
 * Detail panel with tabs: the properties of the object, then its related data, one
 * tab each with its count. The open tab is held by the view, in the URL (`tab`), so
 * that a link, a reload or the Back button reopen it.
 */
export function RelatedTabsPanel({
  open,
  title,
  kind,
  onClose,
  objectId,
  tabs,
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
      badge: <RelatedCount tab={entry} id={objectId} />,
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
          size="wider"
          actions={titleActions}
        />
      }
      rail={<PanelHistoryRail currentKey={recordKey(kind, objectId)} />}
      actions={
        objectId !== undefined && BOOKMARK_KINDS.has(kind) ? (
          <BookmarkButton kind={kind} id={objectId} />
        ) : undefined
      }
      subheader={
        <TabList
          tabs={items}
          active={active}
          onChange={(key) => {
            onTabChange(key === PROPERTIES_TAB ? undefined : key);
          }}
          label={label}
          idPrefix={tabsId}
        />
      }
    >
      {/* Another record or another tab brings other data, which is not an update to flash. */}
      <FlashScope subject={`${kind}:${objectId ?? ""}:${active}`}>
        <div {...tabPanelProps(tabsId, active)} className="outline-none">
          {related === undefined || objectId === undefined
            ? children
            : related.render(objectId, i18n.language)}
        </div>
      </FlashScope>
    </SlideOver>
  );
}
