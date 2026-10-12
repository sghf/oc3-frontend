import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatPercent } from "@/lib/format";

/** Below this change, in points, the rate is taken as steady and gets no mark. */
const TREND_THRESHOLD = 0.01;

/**
 * An availability rate, against the SLA of the object: in red when it falls
 * below, in green when it meets or exceeds it, with a tooltip and screen-reader
 * text saying which. No mark before it, not to be mistaken for the trend arrow.
 * Without SLA, the plain percent.
 *
 * With a `trend`, the change of the rate over the last 7 days in points, an arrow
 * follows: up and green when it improves, down and red when it worsens, with a
 * tooltip giving the change. None when it is steady or unknown.
 */
export function AvailabilityRate({
  rate,
  sla,
  trend,
  locale,
}: {
  rate: number;
  sla: number | null | undefined;
  trend?: number | null | undefined;
  locale: string;
}) {
  const { t } = useTranslation();
  let value: ReactNode = formatPercent(rate, locale);
  if (typeof sla === "number") {
    const below = rate < sla;
    const label = t(below ? "services.belowSla" : "services.meetsSla", {
      sla: formatPercent(sla, locale, 3),
    });
    value = (
      <span title={label} className={`font-medium ${below ? "text-state-down" : "text-state-up"}`}>
        {value}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  if (typeof trend !== "number" || Math.abs(trend) <= TREND_THRESHOLD) return <>{value}</>;
  const up = trend > 0;
  const points = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    Math.abs(trend),
  );
  const title = t(up ? "services.trend.up" : "services.trend.down", { points });
  return (
    <span className="inline-flex items-center gap-1">
      {value}
      <span title={title} className={`font-semibold ${up ? "text-state-up" : "text-state-down"}`}>
        <span aria-hidden="true">{up ? "↑" : "↓"}</span>
        <span className="sr-only">{title}</span>
      </span>
    </span>
  );
}
