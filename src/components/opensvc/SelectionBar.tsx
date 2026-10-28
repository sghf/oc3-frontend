import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Above a table whose rows are ticked: the actions menu for them, how many are
 * ticked, and the button unticking them all. Nothing while none is.
 */
export function SelectionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {children}
      <span className="text-ink-muted tabular-nums">{t("list.selected", { count })}</span>
      <button type="button" onClick={onClear} className="text-accent hover:underline">
        {t("list.clearSelection")}
      </button>
    </div>
  );
}
