import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/Switch";

/**
 * A flag of the collector in a list cell, as the toggle of its `boolean` cells: a
 * read-only switch whose state is also announced. The flag is stored as `T`/`F`, or
 * as the integer 1/0 of a column such as `svc_ha`. Any other value, such as the
 * empty one of a row without the flagged record, shows nothing. `labelKey` names the
 * flag for assistive technologies.
 */
export function FlagSwitch({
  value,
  labelKey,
}: {
  value: string | number | undefined;
  labelKey: string;
}) {
  const { t } = useTranslation();
  const on = value === "T" || value === 1;
  if (!on && value !== "F" && value !== 0) return null;
  return (
    <Switch
      checked={on}
      label={t(labelKey)}
      stateLabel={t(on ? "detail.yes" : "detail.no")}
      disabled
    />
  );
}
