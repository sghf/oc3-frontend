import { useTranslation } from "react-i18next";
import type { RelatedSummary } from "@/components/opensvc/related-tabs";
import { NODE_PROPS } from "@/features/nodes/node-props";
import {
  assetDifferences,
  attachmentDifferences,
  moduleDifferences,
  packageDifferences,
} from "./nodes-diff";
import {
  useNodesAssets,
  useNodesCompliance,
  useServiceNodeIds,
  useServicePackagesDiff,
} from "./queries";

/**
 * Counter of the Nodes Differences tab: the total number of differences between
 * the nodes of a service, the sum of its categories, read through the same queries
 * as the tab, which then opens without reloading anything. No count while a
 * category loads or when one cannot be read; "not applicable" when the service runs
 * on fewer than two nodes, which leaves nothing to compare.
 *
 * The comparisons are costly for the collector: read only once the tab is open
 * (`active`), the count then kept from what they read.
 */
export function useNodesDiffSummary(svcId: string | undefined, active: boolean): RelatedSummary {
  const { t } = useTranslation();
  const nodeIds = useServiceNodeIds(svcId);
  const assets = useNodesAssets(nodeIds.data, active);
  const packages = useServicePackagesDiff(svcId, false, active);
  const compliance = useNodesCompliance(nodeIds.data, active);

  if (nodeIds.data === undefined) return { count: undefined };
  if (nodeIds.data.length < 2)
    return { count: undefined, notApplicable: t("services.pkgdiff.singleNode") };
  if (assets.data === undefined || packages.data === undefined || compliance.data === undefined)
    return { count: undefined };
  return {
    count:
      assetDifferences(assets.data, NODE_PROPS).length +
      (packages.data === null ? 0 : packageDifferences(packages.data).length) +
      moduleDifferences(compliance.data).length +
      attachmentDifferences(compliance.data, (n) => n.modulesets.map((m) => m.modset_name)).length +
      attachmentDifferences(compliance.data, (n) => n.rulesets.map((r) => r.ruleset_name)).length,
  };
}
