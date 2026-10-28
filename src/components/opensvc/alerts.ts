import type { TFunction } from "i18next";
import type { components } from "@/lib/api/schema";
import { SEVERITY_LEVELS, severityLevel } from "./severity";

export type AlertRow = components["schemas"]["AlertRow"];

/** The props of an alert the panels show. */
export const ALERT_PROPS = "id,dash_severity,dash_type,alert,dash_env,dash_created,dash_updated";

/**
 * The summary of an alerts tile: the count, split by severity, each share in the
 * tone of its severity and named, not told by its color alone.
 */
export function alertsSummary(rows: AlertRow[] | undefined, t: TFunction) {
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
}
