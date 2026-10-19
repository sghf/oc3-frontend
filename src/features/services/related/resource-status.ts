import { statusSummary } from "@/components/opensvc/status-summary";
import type { ServiceResource } from "./queries";

/**
 * The shares of a resource list for a tab counter: down, in warning and the
 * others, which add up to the count.
 */
export function resourceStatusSummary(
  rows: ServiceResource[] | undefined,
  t: (key: string, options: { count: number }) => string,
) {
  return statusSummary(
    rows?.map((row) => row.res_status),
    t,
    "services.resources",
  );
}
