import { ObjectNotes } from "@/components/opensvc/ObjectNotes";
import { OVERVIEW_GROUP } from "@/components/opensvc/RelatedTileNav";
import { useTranslation } from "react-i18next";
import type {
  RelatedTab,
  RelatedTabGroup,
  RelatedSummary,
} from "@/components/opensvc/related-tabs";
import { alertsSummary } from "@/components/opensvc/alerts";
import { ColumnFamilyIcon } from "@/components/opensvc/ColumnFamily";
import { NodeAlerts } from "./NodeAlerts";
import { NodeChecks } from "./NodeChecks";
import { isOutOfBounds } from "./checks";
import { NodeHardware } from "./NodeHardware";
import { NodeNetworks } from "./NodeNetworks";
import { NodePackages } from "./NodePackages";
import { NodeStorage } from "./NodeStorage";
import { NodeLogs } from "./NodeLogs";
import { NodeServices } from "./NodeServices";
import { NodeStats } from "./NodeStats";
import { BookIcon, GearIcon, LineChartIcon } from "@/components/ui/icons";
import { NodeSysreport } from "./NodeSysreport";
import { NodeCompliance } from "./NodeCompliance";
import {
  useNodeAlerts,
  useNodeChecks,
  useNodeDisks,
  useNodeHardware,
  useNodeIps,
  useNodeLogs,
  useNodePackageCount,
  useNodeServices,
  useNodeSysreport,
} from "./queries";
import { nokCount, useCompStatus } from "@/lib/api/object-compliance";
import { periodBegin } from "./sysreport-period";
import { statusSummary } from "@/components/opensvc/status-summary";
import { ServiceActions } from "@/features/services/related/ServiceActions";
import { actionStatusSummary } from "@/features/services/related/action-status";
import { useNodeActionStats } from "@/features/services/related/queries";

/** A count of rows, the summary of a list without shares. */
function countSummary(count: number | undefined): RelatedSummary {
  return { count };
}

/**
 * Data attached to a node, one tab each, gathered in groups by `NODE_TAB_GROUPS`.
 *
 * Adding a kind of data — addresses, services, tags, checks… — amounts to writing
 * its component, adding it here and naming it in a group. The summary reuses the
 * component's query: opening the tab reloads nothing. What the agent inventories —
 * hardware, network addresses, storage, packages — is a tab per category, the
 * Inventory tab they shared once (`tab=inventory`) opening the first of them.
 */
export const NODE_RELATED_TABS: RelatedTab[] = [
  {
    key: "notes",
    // The notes are not counted: their revisions say nothing of the node.
    hideCount: true,
    labelKey: "notes.tab",
    descriptionKey: "notes.description",
    icon: <BookIcon className="h-4 w-4 shrink-0 text-icon-node" />,
    useSummary: () => ({ count: undefined }),
    render: (id) => <ObjectNotes kind="node" id={id} />,
  },
  {
    key: "services",
    labelKey: "nodes.related.services",
    descriptionKey: "nodes.related.descriptions.services",
    icon: <ColumnFamilyIcon family="service" />,
    // The instances split by overall status into those down, in warning, and the
    // others: what the tab is opened for stands out.
    useSummary: (nodeId) => {
      const { t } = useTranslation();
      return statusSummary(
        useNodeServices(nodeId).data?.map((row) => row.mon_overallstatus),
        t,
        "nodes.services",
      );
    },
    render: (nodeId, locale) => <NodeServices nodeId={nodeId} locale={locale} />,
  },
  {
    key: "actions",
    labelKey: "nodes.related.actions",
    descriptionKey: "nodes.related.descriptions.actions",
    // The gear of the historical actions tab (`action16`), as on the service.
    icon: <GearIcon className="h-4 w-4 shrink-0 text-icon-node" />,
    // The actions of the period by status, those of every service of the node.
    useSummary: (nodeId) => {
      const { t } = useTranslation();
      return actionStatusSummary(useNodeActionStats(nodeId).data, t);
    },
    render: (nodeId, locale) => <ServiceActions nodeId={nodeId} locale={locale} />,
  },
  {
    key: "hardware",
    hideCount: true,
    labelKey: "nodes.inventory.categories.hardware",
    descriptionKey: "nodes.related.descriptions.hardware",
    icon: <ColumnFamilyIcon family="cpu" />,
    useSummary: (nodeId) => countSummary(useNodeHardware(nodeId).data?.length),
    render: (nodeId, locale) => <NodeHardware nodeId={nodeId} locale={locale} />,
  },
  {
    key: "networks",
    hideCount: true,
    labelKey: "nodes.inventory.categories.networks",
    descriptionKey: "nodes.related.descriptions.networks",
    icon: <ColumnFamilyIcon family="network" />,
    useSummary: (nodeId) => countSummary(useNodeIps(nodeId).data?.length),
    render: (nodeId) => <NodeNetworks nodeId={nodeId} />,
  },
  {
    key: "storage",
    hideCount: true,
    labelKey: "nodes.inventory.categories.storage",
    descriptionKey: "nodes.related.descriptions.storage",
    icon: <ColumnFamilyIcon family="disk" />,
    // Its disks; the host bus adapters come before them in the tab.
    useSummary: (nodeId) => countSummary(useNodeDisks(nodeId).data?.length),
    render: (nodeId, locale) => <NodeStorage nodeId={nodeId} locale={locale} />,
  },
  {
    key: "packages",
    hideCount: true,
    labelKey: "nodes.inventory.categories.packages",
    descriptionKey: "nodes.related.descriptions.packages",
    icon: <ColumnFamilyIcon family="package" />,
    // Counted apart: the list itself, a couple of thousand rows, loads with the tab.
    useSummary: (nodeId) => countSummary(useNodePackageCount(nodeId).data),
    render: (nodeId, locale) => <NodePackages nodeId={nodeId} locale={locale} />,
  },
  {
    key: "sysreport",
    hideCount: true,
    labelKey: "nodes.related.sysreport",
    descriptionKey: "nodes.related.descriptions.sysreport",
    icon: <ColumnFamilyIcon family="time" />,
    // The changes of the last seven days: whether the node moved lately.
    useSummary: (nodeId) => ({
      count: useNodeSysreport(nodeId, { path: "", begin: periodBegin("week"), limit: 1 }).data
        ?.total,
    }),
    render: (nodeId, locale) => <NodeSysreport nodeId={nodeId} locale={locale} />,
  },
  {
    key: "stats",
    labelKey: "nodes.related.stats",
    descriptionKey: "nodes.related.descriptions.stats",
    icon: <LineChartIcon className="h-3.5 w-3.5 text-icon-node" />,
    // No count: charts are not a list.
    useSummary: () => ({ count: undefined }),
    render: (nodeId, locale) => <NodeStats nodeId={nodeId} locale={locale} />,
  },
  {
    key: "alerts",
    labelKey: "nodes.related.alerts",
    descriptionKey: "nodes.related.descriptions.alerts",
    icon: <ColumnFamilyIcon family="alert" />,
    useSummary: (nodeId) => {
      const { t } = useTranslation();
      return alertsSummary(useNodeAlerts(nodeId).data, t);
    },
    render: (nodeId, locale) => <NodeAlerts nodeId={nodeId} locale={locale} />,
  },
  {
    key: "checks",
    labelKey: "nodes.related.checks",
    descriptionKey: "nodes.related.descriptions.checks",
    icon: <ColumnFamilyIcon family="state" />,
    // The checks out of their thresholds stand out from the others.
    useSummary: (nodeId) => {
      const { t } = useTranslation();
      const rows = useNodeChecks(nodeId).data;
      const count = (rows ?? []).filter(isOutOfBounds).length;
      return {
        count: rows?.length,
        parts: [
          {
            key: "outOfBounds",
            count,
            box: "bg-state-down-soft text-state-down",
            label: t("nodes.checks.outOfBoundsCount", { count }),
          },
        ],
      };
    },
    render: (nodeId, locale) => <NodeChecks nodeId={nodeId} locale={locale} />,
  },
  {
    key: "compliance",
    labelKey: "nodes.related.compliance",
    descriptionKey: "nodes.related.descriptions.compliance",
    icon: <ColumnFamilyIcon family="moduleset" />,
    // The modules whose last check failed stand out from the others.
    useSummary: (nodeId) => {
      const { t } = useTranslation();
      const rows = useCompStatus(
        nodeId === undefined ? undefined : { kind: "node", id: nodeId },
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
    render: (nodeId, locale) => <NodeCompliance nodeId={nodeId} locale={locale} />,
  },
  {
    key: "logs",
    hideCount: true,
    labelKey: "nodes.related.logs",
    descriptionKey: "nodes.related.descriptions.logs",
    icon: <ColumnFamilyIcon family="time" />,
    // All the entries of the node, not only those the tab shows.
    useSummary: (nodeId) => {
      const page = useNodeLogs(nodeId).data;
      return { count: page === undefined ? undefined : (page.total ?? page.rows.length) };
    },
    render: (nodeId, locale) => <NodeLogs nodeId={nodeId} locale={locale} />,
  },
];

/**
 * The tabs of the node after its properties, grouped by the question they answer,
 * as the historical node tabs could no longer fit in a bar: what runs on the node,
 * how it is doing, what it is made of and what changed, what was logged. Each
 * group is a box of tiles (`RelatedTileNav`).
 */
export const NODE_TAB_GROUPS: RelatedTabGroup[] = [
  {
    // After the properties, in their box.
    key: OVERVIEW_GROUP,
    labelKey: "related.groups.overview",
    tabs: ["notes"],
  },
  {
    key: "workload",
    labelKey: "related.groups.workload",
    tabs: ["services", "actions"],
  },
  {
    key: "health",
    labelKey: "related.groups.health",
    tabs: ["alerts", "checks", "stats"],
  },
  {
    key: "configuration",
    labelKey: "related.groups.configuration",
    tabs: ["hardware", "networks", "storage", "packages", "sysreport", "compliance"],
  },
  {
    key: "logs",
    labelKey: "nodes.related.logs",
    tabs: ["logs"],
  },
];
