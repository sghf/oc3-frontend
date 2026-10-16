import { parseCollectorDate } from "@/lib/format";

/**
 * Days after which a check no longer tells the state of its module, as the server
 * counts it (`CompStatusObsoleteAfter` in oc3) and the historical views did.
 */
export const OBSOLETE_DAYS = 7;

/** Whether a check is too old to tell the state of its module at `now`. */
export function isObsoleteRun(runDate: string | undefined, now: number): boolean {
  const parsed = parseCollectorDate(runDate);
  return parsed !== null && now - parsed.getTime() > OBSOLETE_DAYS * 24 * 60 * 60 * 1000;
}
