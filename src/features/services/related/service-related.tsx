import { ColumnFamilyIcon } from "@/components/opensvc/ColumnFamily";
import { GearIcon } from "@/components/ui/icons";
import type { RelatedTab } from "@/components/opensvc/related-tabs";
import { useTranslation } from "react-i18next";
import { ServiceActions } from "./ServiceActions";
import { ServiceLogs } from "./ServiceLogs";
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
 * (`NODE_RELATED_TABS`). Adding instances, alerts or tags amounts to
 * writing the component and adding it here.
 */
export const SERVICE_RELATED_TABS: RelatedTab[] = [
  {
    key: "resources",
    labelKey: "services.related.resources",
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
    labelKey: "services.related.storage",
    icon: <ColumnFamilyIcon family="disk" />,
    // As for the node, the count is that of the disks, the bulk of the tab.
    useSummary: (svcId) => ({ count: useServiceDisks(svcId).data?.length }),
    render: (svcId, locale) => <ServiceStorage svcId={svcId} locale={locale} />,
  },
  {
    key: "nodediff",
    labelKey: "services.related.nodediff",
    icon: <ColumnFamilyIcon family="node" />,
    // The total of its categories, "n/a" on a single node. It reads the assets, the
    // packages and the compliance of every node when the panel opens; the tab then
    // reuses them.
    useSummary: (svcId) => useNodesDiffSummary(svcId),
    render: (svcId) => <ServiceNodesDiff svcId={svcId} />,
  },
  {
    key: "actions",
    labelKey: "services.related.actions",
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
    key: "logs",
    labelKey: "services.related.logs",
    icon: <ColumnFamilyIcon family="time" />,
    // All the entries of the service, not only those the tab shows.
    useSummary: (svcId) => {
      const page = useServiceLogs(svcId).data;
      return { count: page === undefined ? undefined : (page.total ?? page.rows.length) };
    },
    render: (svcId, locale) => <ServiceLogs svcId={svcId} locale={locale} />,
  },
];
