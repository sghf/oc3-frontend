import { useId } from "react";
import { useTranslation } from "react-i18next";
import { formatCapacityMiB, formatPercent } from "@/lib/format";
import { QUOTA_WARN_RATIO, UNITS, type SizeValue, type Unit } from "./quota-size";

/**
 * How much of a quota its application uses: a bar, the share and the space,
 * flagged in words and by a mark from QUOTA_WARN_RATIO, and over the quota.
 */
export function QuotaUsage({
  used,
  quota,
  locale,
  wide = false,
}: {
  used: number | undefined;
  quota: number | undefined;
  locale: string;
  /** The space used and the quota said after the share, in a panel. */
  wide?: boolean;
}) {
  const { t } = useTranslation();
  if (quota === undefined || quota <= 0) return null;
  const ratio = (used ?? 0) / quota;
  const tone =
    ratio > 1
      ? { bar: "bg-state-down", text: "text-state-down", mark: "■", label: t("quotas.usage.over") }
      : ratio >= QUOTA_WARN_RATIO
        ? {
            bar: "bg-state-warn",
            text: "text-state-warn",
            mark: "▲",
            label: t("quotas.usage.near"),
          }
        : { bar: "bg-state-up", text: "text-ink-muted", mark: "", label: "" };
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span
        aria-hidden="true"
        className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken"
      >
        <span
          className={`absolute inset-y-0 left-0 ${tone.bar}`}
          style={{ width: `${String(Math.min(ratio, 1) * 100)}%` }}
        />
      </span>
      {/* A fixed width, right-aligned, its mark's place kept on every row: in a
          column, the shares and their marks line up. */}
      <span className={`inline-flex w-[4.75rem] shrink-0 justify-end gap-1 ${tone.text}`}>
        <span aria-hidden="true" className={tone.mark === "" ? "invisible" : ""}>
          {tone.mark === "" ? "■" : tone.mark}
        </span>
        {formatPercent(ratio * 100, locale, 0)}
        {tone.label !== "" && <span className="sr-only"> {tone.label}</span>}
      </span>
      {wide && (
        <span className="text-ink-muted">
          {t("quotas.usage.of", {
            used: formatCapacityMiB(used ?? 0, locale) || "0",
            quota: formatCapacityMiB(quota, locale),
          })}
          {tone.label !== "" && ` · ${tone.label}`}
        </span>
      )}
    </span>
  );
}

/** A size field and its unit, GiB or TiB: quotas are not typed in MiB. */
export function SizeInput({
  value,
  onChange,
  label,
  unitLabel,
  disabled = false,
}: {
  value: SizeValue;
  onChange: (next: SizeValue) => void;
  label: string;
  /** The accessible name of the unit picker. */
  unitLabel: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-1">
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        value={value.amount}
        disabled={disabled}
        onChange={(event) => {
          onChange({ ...value, amount: event.target.value });
        }}
        className="h-8 w-32 rounded-(--radius-control) border border-line bg-surface px-2 tabular-nums"
      />
      <select
        aria-label={unitLabel}
        value={value.unit}
        disabled={disabled}
        onChange={(event) => {
          onChange({ ...value, unit: event.target.value as Unit });
        }}
        className="h-8 rounded-(--radius-control) border border-line bg-surface px-1"
      >
        {(Object.keys(UNITS) as Unit[]).map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </div>
  );
}
