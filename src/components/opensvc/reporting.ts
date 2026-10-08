import { parseCollectorDate } from "@/lib/format";

/**
 * Minutes without a report after which a service, an instance or a node is
 * outdated: the agent reports every minute or so, and the historical collector
 * greyed the status of a row, and counted a node as gone, after 15 minutes of
 * silence.
 */
export const REPORT_MAX_AGE_MINUTES = 15;

/** How often the lists work out again which rows are outdated. */
export const REPORTING_TICK_MS = 30 * 1000;

/**
 * Whether the last report, `updated`, is older than `REPORT_MAX_AGE_MINUTES` at
 * `now`; a row that never reported is outdated too.
 */
export function isOutdated(updated: string | null | undefined, now: number): boolean {
  const parsed = parseCollectorDate(updated ?? undefined);
  if (parsed === null) return true;
  return now - parsed.getTime() > REPORT_MAX_AGE_MINUTES * 60 * 1000;
}
