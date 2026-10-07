import type { components } from "@/lib/api/schema";

/** What uses a filterset, as `GET /filtersets/{id}/usage` returns it. */
export type FiltersetUsage = components["schemas"]["FiltersetUsageResponse"]["data"];

/** How many objects use a filterset, whatever their kind. */
export function filtersetUsageCount(usage: FiltersetUsage): number {
  return (
    usage.filtersets.length +
    usage.rulesets.length +
    usage.thresholds.length +
    usage.users.length +
    usage.comparisons.length +
    usage.sysreport_grants.length
  );
}
