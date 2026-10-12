import { ObjectCompliance } from "@/components/opensvc/ObjectCompliance";

/**
 * The compliance of a node, as the historical tab: the modulesets and rulesets
 * attached to it, then the last check of each module, on the node then on each
 * service instance it hosts.
 */
export function NodeCompliance({ nodeId, locale }: { nodeId: string; locale: string }) {
  return (
    <ObjectCompliance
      target={{ kind: "node", id: nodeId }}
      locale={locale}
      groupStatusBy="service"
    />
  );
}
