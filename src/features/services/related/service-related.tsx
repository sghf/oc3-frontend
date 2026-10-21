import { ObjectNotes } from "@/components/opensvc/ObjectNotes";
import { OVERVIEW_GROUP } from "@/components/opensvc/RelatedTileNav";
import { ColumnFamilyIcon } from "@/components/opensvc/ColumnFamily";
import { BookIcon, GearIcon } from "@/components/ui/icons";
import type { RelatedTab, RelatedTabGroup } from "@/components/opensvc/related-tabs";
import { useTranslation } from "react-i18next";
import { ServiceActions } from "./ServiceActions";
import { ServiceCompliance } from "./ServiceCompliance";
import { ServiceLogs } from "./ServiceLogs";
import { nokCount, useCompStatus } from "@/lib/api/object-compliance";
import { ServiceNodesDiff } from "./ServiceNodesDiff";
import { ServiceResources } from "./ServiceResources";
import { resourceStatusSummary } from "./resource-status";
import { actionStatusSummary } from "./action-status";
import { ServiceStorage } from "./ServiceStorage";
import {
  useServiceActionStats,
  useServiceDisks,
  useServiceLogs,
  useServiceResources,
} from "./queries";
import { useNodesDiffSummary } from "./use-nodes-diff-summary";

/**
 * Data attached to a service, one tab each, on the model of the node
 * (`NODE_RELATED_TABS`), gathered in groups by `SERVICE_TAB_GROUPS`. Adding
 * instances, alerts or tags amounts to writing the component, adding it here and
 * naming it in a group.
 */
export const SERVICE_RELATED_TABS: RelatedTab[] = [
  {
    key: "notes",
    // The notes are not counted: their revisions say nothing of the service.
    hideCount: true,
    labelKey: "notes.tab",
    descriptionKey: "notes.description",
    icon: <BookIcon className="h-4 w-4 shrink-0 text-icon-service" />,
    useSummary: () => ({ count: undefined }),
    render: (id, locale) => <ObjectNotes kind="service" id={id} locale={locale} />,
  },
  {
    key: "resources",
    labelKey: "services.related.resources",
    descriptionKey: "services.related.descriptions.resources",
    icon: <ColumnFamilyIcon family="resource" />,
    // The resources split into those down, in warning, and the others: the shares
    // add up to the count, and the first two are what the tab is opened for.
    useSummary: (svcId) => {
      const { t } = useTranslation();
      return resourceStatusSummary(useServiceResources(svcId).data, t);
    },
    render: (svcId, locale) => <ServiceResources svcId={svcId} locale={locale} />,
  },
  {
    key: "storage",
    hideCount: true,
    labelKey: "services.related.storage",
    descriptionKey: "services.related.descriptions.storage",
    icon: <ColumnFamilyIcon family="disk" />,
    // As for the node, the count is that of the disks, the bulk of the tab.
    useSummary: (svcId) => ({ count: useServiceDisks(svcId).data?.length }),
    render: (svcId, locale) => <ServiceStorage svcId={svcId} locale={locale} />,
  },
  {
    key: "nodediff",
    labelKey: "services.related.nodediff",
    descriptionKey: "services.related.descriptions.nodediff",
    icon: <ColumnFamilyIcon family="node" />,
    // The total of its categories, "n/a" on a single node. It reads the assets, the
    // packages and the compliance of every node when the panel opens; the tab then
    // reuses them.
    useSummary: (svcId, active) => useNodesDiffSummary(svcId, active),
    render: (svcId) => <ServiceNodesDiff svcId={svcId} />,
  },
  {
    key: "actions",
    labelKey: "services.related.actions",
    descriptionKey: "services.related.descriptions.actions",
    // The gear of the historical actions tab (`action16`).
    icon: <GearIcon className="h-4 w-4 shrink-0 text-icon-service" />,
    // The actions of the period split into those in error, in warning and the
    // others, counted by the server over all of them, not only those the tab shows.
    useSummary: (svcId) => {
      const { t } = useTranslation();
      return actionStatusSummary(useServiceActionStats(svcId).data, t);
    },
    render: (svcId, locale) => <ServiceActions svcId={svcId} locale={locale} />,
  },
  {
    key: "compliance",
    labelKey: "nodes.related.compliance",
    descriptionKey: "services.related.descriptions.compliance",
    icon: <ColumnFamilyIcon family="moduleset" />,
    // The modules whose last check failed, on any node, stand out from the others.
    useSummary: (svcId) => {
      const { t } = useTranslation();
      const rows = useCompStatus(
        svcId === undefined ? undefined : { kind: "service", id: svcId },
      ).data;
      const count = nokCount(rows);
      return {
        count: rows?.length,
        parts: [
          {
            key: "nok",
            count,
            box: "bg-state-down-soft text-state-down",
            label: t("objectCompliance.status.nokCount", { count }),
          },
        ],
      };
    },
    render: (svcId, locale) => <ServiceCompliance svcId={svcId} locale={locale} />,
  },
  {
    key: "logs",
    hideCount: true,
    labelKey: "services.related.logs",
    descriptionKey: "services.related.descriptions.logs",
    icon: <ColumnFamilyIcon family="time" />,
    // All the entries of the service, not only those the tab shows.
    useSummary: (svcId) => {
      const page = useServiceLogs(svcId).data;
      return { count: page === undefined ? undefined : (page.total ?? page.rows.length) };
    },
    render: (svcId, locale) => <ServiceLogs svcId={svcId} locale={locale} />,
  },
];

/**
 * The tabs of the service after its properties, grouped as the
 * node's (`NODE_TAB_GROUPS`): what the service runs and what the agents did, what
 * it is made of and how its nodes differ, what was logged. A Health group comes
 * with the alerts and checks of the service, which have no tab yet.
 */
export const SERVICE_TAB_GROUPS: RelatedTabGroup[] = [
  {
    // After the properties, in their box.
    key: OVERVIEW_GROUP,
    labelKey: "related.groups.overview",
    tabs: ["notes"],
  },
  {
    key: "workload",
    labelKey: "related.groups.workload",
    tabs: ["resources", "actions"],
  },
  {
    key: "configuration",
    labelKey: "related.groups.configuration",
    tabs: ["storage", "nodediff", "compliance"],
  },
  {
    key: "logs",
    labelKey: "services.related.logs",
    tabs: ["logs"],
  },
];
