import type { TFunction } from "i18next";
import { isInverted, toEnumValues, toTextDraft } from "@/lib/column-filters";
import type { ColumnFilterOption, ListColumn } from "./CollectorList";

/** Whether a column can be filtered at all. */
export function isFilterable<T>(column: ListColumn<T>): boolean {
  return column.filter?.kind !== "none";
}

/** Whether a column offers the distribution of its values: see ListColumn. */
export function hasDistribution<T>(column: ListColumn<T>): boolean {
  if (column.filter?.kind === "none") return false;
  return column.distribution ?? column.family !== "time";
}

export function optionLabel(option: ColumnFilterOption, t: TFunction): string {
  return option.labelKey === undefined ? option.value : t(option.labelKey);
}

/**
 * A filter as the bar of active filters shows it: as it was typed or chosen. The
 * inversion is not part of it: the bar says it in words before the value.
 */
export function describeFilter<T>(
  column: ListColumn<T> | undefined,
  expr: string,
  t: TFunction,
): string {
  if (column === undefined) return expr;
  const spec = column.filter;
  const draft = toTextDraft(expr);
  // Values picked from a list, or from the distribution of a text column: named.
  // A single exact value of a text column keeps its "=", which tells it from a
  // substring.
  if (spec?.kind === "enum" || draft.text.startsWith("in:")) {
    const options = spec?.kind === "enum" ? spec.options : [];
    const values = toEnumValues(expr);
    if (values.length > 0)
      return values
        .map((value) => {
          const option = options.find((candidate) => candidate.value === value);
          return option === undefined ? value : optionLabel(option, t);
        })
        .join(", ");
  }
  return draft.regex ? `/${draft.text}/` : draft.text;
}

/**
 * The text a substring filter holds: the values of the column are narrowed to
 * those containing it. Any other filter (exact values, a regular expression, a
 * comparison, an inversion) narrows nothing, the values staying those to pick.
 */
export function narrowing(expr: string | undefined): string | undefined {
  if (expr === undefined || isInverted(expr)) return undefined;
  const draft = toTextDraft(expr);
  if (draft.regex || /^(in:|eq:|ne:|gte?:|lte?:|empty$)/.test(expr)) return undefined;
  return draft.text.trim() === "" ? undefined : draft.text.trim();
}
