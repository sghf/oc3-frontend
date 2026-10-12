import { useTranslation } from "react-i18next";
import type { ColumnFilterOption } from "@/components/opensvc/CollectorList";
import { StatusBadge, type ObjectState } from "@/components/opensvc/StatusBadge";

/**
 * Exit codes of a module run, as the historical cells tell them: 0 ok, 1 not ok,
 * 2 not applicable, -15 killed; any other code is shown as is.
 */
const RUN_STATUSES: Record<string, { state: ObjectState; labelKey: string }> = {
  "0": { state: "up", labelKey: "complianceLogs.status.ok" },
  "1": { state: "down", labelKey: "complianceLogs.status.nok" },
  "2": { state: "unknown", labelKey: "complianceLogs.status.na" },
  "-15": { state: "warn", labelKey: "complianceLogs.status.killed" },
};

/** The exit codes of a module run, for the enumerated filter of a status column. */
export const RUN_STATUS_OPTIONS: ColumnFilterOption[] = Object.entries(RUN_STATUSES).map(
  ([value, { labelKey }]) => ({ value, labelKey }),
);

/**
 * The exit code of a module run as a status badge. `outdated` greys it, for a
 * check too old to tell the state of its module.
 */
export function RunStatus({
  value,
  outdated = false,
}: {
  value: number | undefined;
  outdated?: boolean;
}) {
  const { t } = useTranslation();
  if (value === undefined) return null;
  const known = RUN_STATUSES[String(value)];
  return known === undefined ? (
    <StatusBadge state="unknown" label={String(value)} outdated={outdated} />
  ) : (
    <StatusBadge state={known.state} label={t(known.labelKey)} outdated={outdated} />
  );
}

/** The output of a run, preformatted, its "ERR:" marks in the error tint. */
export function RunLog({ value }: { value: string | undefined }) {
  if (value === undefined || value === "") return null;
  const parts = value.split("ERR:");
  return (
    <pre className="m-0 font-mono wrap-anywhere whitespace-pre-wrap">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="font-semibold text-state-down">ERR:</span>}
          {part}
        </span>
      ))}
    </pre>
  );
}
