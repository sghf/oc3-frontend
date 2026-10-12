import { useTranslation } from "react-i18next";
import type { RelatedTab } from "@/components/opensvc/related-tabs";
import { SEVERITY_LEVELS, severityLevel } from "@/components/opensvc/severity";
import { ColumnFamilyIcon } from "@/components/opensvc/ColumnFamily";
import { NodeAlerts } from "./NodeAlerts";
import { NodeChecks } from "./NodeChecks";
import { isOutOfBounds } from "./checks";
import { NodeInventory } from "./NodeInventory";
import { NodeLogs } from "./NodeLogs";
import { NodeStats } from "./NodeStats";
import { LineChartIcon } from "@/components/ui/icons";
import { NodeSysreport } from "./NodeSysreport";
import { NodeCompliance } from "./NodeCompliance";
import { useNodeAlerts, useNodeChecks, useNodeLogs, useNodeSysreport } from "./queries";
import { nokCount, useCompStatus } from "@/lib/api/object-compliance";
import { periodBegin } from "./sysreport-period";

/**
 * Data attached to a node, one tab each, in display order.
 *
 * Adding a kind of data — addresses, services, tags, checks… — amounts to writing
 * its component and adding it here. The summary reuses the component's query:
 * opening the tab reloads nothing. What the agent inventories — hardware, network
 * addresses, storage, packages — shares the Inventory tab, one category at a time.
 */
export const NODE_RELATED_TABS: RelatedTab[] = [
  {
    key: "inventory",
    labelKey: "nodes.related.inventory",
    icon: <ColumnFamilyIcon family="cpu" />,
    // No count of its own: each category of the tab carries its count on its chip.
    useSummary: () => ({ count: undefined }),
    render: (nodeId, locale) => <NodeInventory nodeId={nodeId} locale={locale} />,
  },
  {
    key: "sysreport",
    labelKey: "nodes.related.sysreport",
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
    icon: <LineChartIcon className="h-3.5 w-3.5 text-icon-node" />,
    // No count: charts are not a list.
    useSummary: () => ({ count: undefined }),
    render: (nodeId, locale) => <NodeStats nodeId={nodeId} locale={locale} />,
  },
  {
    key: "alerts",
    labelKey: "nodes.related.alerts",
    icon: <ColumnFamilyIcon family="alert" />,
    useSummary: (nodeId) => {
      const { t } = useTranslation();
      const rows = useNodeAlerts(nodeId).data;
      return {
        count: rows?.length,
        parts: SEVERITY_LEVELS.map((level) => {
          const count = (rows ?? []).filter(
            (row) => severityLevel(row.dash_severity ?? 0).key === level.key,
          ).length;
          return {
            key: level.key,
            count,
            box: level.box,
            label: t(`dashboard.severityCount.${level.key}`, { count }),
          };
        }),
      };
    },
    render: (nodeId, locale) => <NodeAlerts nodeId={nodeId} locale={locale} />,
  },
  {
    key: "checks",
    labelKey: "nodes.related.checks",
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
    labelKey: "nodes.related.logs",
    icon: <ColumnFamilyIcon family="time" />,
    // All the entries of the node, not only those the tab shows.
    useSummary: (nodeId) => {
      const page = useNodeLogs(nodeId).data;
      return { count: page === undefined ? undefined : (page.total ?? page.rows.length) };
    },
    render: (nodeId, locale) => <NodeLogs nodeId={nodeId} locale={locale} />,
  },
];
