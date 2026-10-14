import type { ReactNode } from "react";

/** Share of a count, shown in its own pill. */
export interface SummaryPart {
  key: string;
  count: number;
  /** Background and ink classes, through tokens. */
  box: string;
  /** Full label, plural included: tooltip and screen readers. */
  label: string;
}

/**
 * Summary of a tab: its count, and its breakdown when that means something (alerts
 * by severity). Empty shares are not shown.
 */
export interface RelatedSummary {
  count: number | undefined;
  parts?: SummaryPart[];
  /**
   * Shows the empty shares too, at their place: for counters that say something at
   * zero, such as the visible and hidden entries of a menu.
   */
  keepEmptyParts?: boolean;
  /**
   * Why the tab has no count to give, when it cannot apply to the object (nothing
   * to compare on a single node, for instance): the counter then shows "n/a", with
   * this reason as its tooltip and for screen readers.
   */
  notApplicable?: string;
}

/**
 * A kind of data attached to an object (node, service…), presented in a tab of its
 * detail panel. Each object declares the list of them, in display order.
 */
export interface RelatedTab {
  key: string;
  labelKey: string;
  icon: ReactNode;
  /** Hook called by the tab counter, one component per tab. */
  useSummary: (id: string | undefined) => RelatedSummary;
  render: (id: string, locale: string) => ReactNode;
}

/** Key of the properties tab: absent from the URL, it is the default tab. */
export const PROPERTIES_TAB = "properties";
