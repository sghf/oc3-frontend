import { useTranslation } from "react-i18next";
import { SnowflakeIcon } from "@/components/ui/icons";

/**
 * Frozen mark at the head of a row.
 *
 * Freezing reads whatever the columns on display: it says that the object no longer
 * answers orchestration orders, which explains many a state. The snowflake is
 * doubled by a text for screen readers and by a tooltip, colour and shape alone not
 * being enough.
 *
 * `reserveSpace` keeps the place of the mark on a row that is not frozen, so that
 * the values after it line up in a column whether their row is frozen or not.
 */
export function FrozenMark({
  frozen,
  reserveSpace = false,
}: {
  frozen: boolean;
  reserveSpace?: boolean;
}) {
  const { t } = useTranslation();
  if (!frozen)
    return reserveSpace ? (
      <span aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0" />
    ) : null;
  return (
    <span title={t("state.frozen")} className="text-icon-network">
      <SnowflakeIcon className="h-3.5 w-3.5" />
      <span className="sr-only">{t("state.frozen")}</span>
    </span>
  );
}
