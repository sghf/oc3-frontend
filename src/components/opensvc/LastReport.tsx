import { useTranslation } from "react-i18next";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { REPORT_MAX_AGE_MINUTES } from "./reporting";

/**
 * The time of the last report as a distance from now, in the warning tint once
 * outdated, the age itself saying why; "never" when the row never reported.
 */
export function LastReport({
  value,
  locale,
  outdated,
}: {
  value: string | null | undefined;
  locale: string;
  outdated: boolean;
}) {
  const { t } = useTranslation();
  if (!outdated) return <RelativeTime value={value ?? undefined} locale={locale} />;
  return (
    <span
      className="text-state-warn"
      title={t("reporting.outdated", { minutes: REPORT_MAX_AGE_MINUTES })}
    >
      {value === null || value === undefined || value === "" ? (
        t("reporting.never")
      ) : (
        <RelativeTime value={value} locale={locale} />
      )}
    </span>
  );
}
