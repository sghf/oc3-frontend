import type { RelatedSummary } from "./related-tabs";
import { statusBadge } from "./status";

/**
 * The shares of a list of statuses for a tab counter: down, in warning and the
 * others, which add up to the count. The labels are `<keyPrefix>.downCount`,
 * `.warnCount` and `.otherCount`, plural included. `undefined` while the list loads.
 */
export function statusSummary(
  statuses: (string | null | undefined)[] | undefined,
  t: (key: string, options: { count: number }) => string,
  keyPrefix: string,
): RelatedSummary {
  const count = (state: string) =>
    (statuses ?? []).filter((value) => statusBadge(value ?? undefined).state === state).length;
  const down = count("down");
  const warn = count("warn");
  const other = (statuses?.length ?? 0) - down - warn;
  return {
    count: statuses?.length,
    parts: [
      {
        key: "down",
        count: down,
        box: "bg-state-down-soft text-state-down",
        label: t(`${keyPrefix}.downCount`, { count: down }),
      },
      {
        key: "warn",
        count: warn,
        box: "bg-state-warn-soft text-state-warn",
        label: t(`${keyPrefix}.warnCount`, { count: warn }),
      },
      {
        key: "other",
        count: other,
        box: "bg-surface-sunken text-ink-muted",
        label: t(`${keyPrefix}.otherCount`, { count: other }),
      },
    ],
  };
}
