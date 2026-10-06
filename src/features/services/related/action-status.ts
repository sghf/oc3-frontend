import type { ObjectState } from "@/components/opensvc/StatusBadge";
import type { ValueStats } from "@/lib/api/value-stats";

/**
 * The state of an agent action from its status: ok, warn, err as the agent ends
 * it, and an empty status while it runs (or when its end was never reported).
 */
export function actionState(status: string | null | undefined): {
  state: ObjectState;
  labelKey: string;
} {
  switch (status) {
    case "ok":
      return { state: "up", labelKey: "services.actions.statusNames.ok" };
    case "warn":
      return { state: "warn", labelKey: "services.actions.statusNames.warn" };
    case "err":
      return { state: "down", labelKey: "services.actions.statusNames.err" };
    default:
      return { state: "unknown", labelKey: "services.actions.statusNames.running" };
  }
}

/**
 * The shares of the actions of the period for a tab counter: in error, in
 * warning and the others, which add up to the count.
 */
export function actionStatusSummary(
  stats: ValueStats | undefined,
  t: (key: string, options: { count: number }) => string,
) {
  const count = (value: string) => stats?.values.find((item) => item.value === value)?.count ?? 0;
  const err = count("err");
  const warn = count("warn");
  const other = (stats?.total ?? 0) - err - warn;
  return {
    count: stats?.total,
    parts: [
      {
        key: "err",
        count: err,
        box: "bg-state-down-soft text-state-down",
        label: t("services.actions.errCount", { count: err }),
      },
      {
        key: "warn",
        count: warn,
        box: "bg-state-warn-soft text-state-warn",
        label: t("services.actions.warnCount", { count: warn }),
      },
      {
        key: "other",
        count: other,
        box: "bg-surface-sunken text-ink-muted",
        label: t("services.actions.otherCount", { count: other }),
      },
    ],
  };
}
