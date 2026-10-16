import { useTranslation } from "react-i18next";
import type { RelatedTab } from "./related-tabs";

const PILL =
  "inline-flex min-w-5 items-center justify-center gap-0.5 rounded-full px-1.5 text-[0.6875rem] leading-4 tabular-nums";

/**
 * Counter of a related-data tab. A separate component so that the summary hook of
 * each tab is called in its place. A zero count stays on display, dimmed: the tabs do
 * not move from one object to the next.
 *
 * When the summary is broken down (alerts by severity), the pill is cut into
 * sections, one per non-empty share (every share with `keepEmptyParts`), tinted by
 * its category. Only the numbers are
 * shown, as requested: a deliberate departure from the "never colour alone" rule,
 * offset by the fixed order of the sections (from the most severe to the least) and
 * by the full labels in the tooltip and for screen readers (see notes.md).
 */
export function RelatedCount({
  tab,
  id,
  active,
}: {
  tab: RelatedTab;
  id: string | undefined;
  /** The tab is the one on display. */
  active: boolean;
}) {
  const { t } = useTranslation();
  const { count, parts = [], notApplicable, keepEmptyParts } = tab.useSummary(id, active);
  // Not applicable: said, dimmed as a zero, rather than a count the tab cannot give.
  if (notApplicable !== undefined)
    return (
      <span title={notApplicable} className={`${PILL} bg-surface text-ink-muted/60`}>
        <span aria-hidden="true">{t("related.notApplicable")}</span>
        <span className="sr-only">{notApplicable}</span>
      </span>
    );
  if (count === undefined) return null;
  const shown = keepEmptyParts === true ? parts : parts.filter((part) => part.count > 0);
  if (count === 0 || shown.length === 0) {
    return (
      <span
        title={t("related.count", { count })}
        className={`${PILL} ${count === 0 ? "bg-surface text-ink-muted/60" : "bg-surface-sunken text-ink-muted"}`}
      >
        {count}
      </span>
    );
  }
  return (
    <span
      title={shown.map((part) => part.label).join(", ")}
      className="inline-flex items-stretch overflow-hidden rounded-full text-[0.6875rem] leading-4 tabular-nums"
    >
      {shown.map((part) => (
        <span
          key={part.key}
          className={`inline-flex items-center px-1.5 first:pl-2 last:pr-2 ${part.box}`}
        >
          <span aria-hidden="true">{part.count}</span>
          <span className="sr-only">{part.label}</span>
        </span>
      ))}
    </span>
  );
}
