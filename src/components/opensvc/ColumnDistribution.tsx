import { type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  EMPTY_VALUE,
  canPickWithOthers,
  fromPickedValues,
  isInverted,
  toPickedValues,
} from "@/lib/column-filters";
import type { ValueStats } from "@/lib/api/value-stats";
import { Distribution, type DistributionItem } from "@/components/ui/Distribution";

/** How a value of the column is named: the label of its option, or the value. */
export interface ValueLabel {
  text: string;
  render?: ReactNode;
}

/**
 * The distribution of the values of a column, in its filter popover: the most
 * frequent values over the selection of the list, every filter but the column's
 * own applied, so that it shows what the filter could pick rather than what it
 * already keeps. The historical collector drew it as a pie in the filter box;
 * ranked bars read better past a handful of values and need no colour per value.
 *
 * A pick sets the filter of the column at once: a click picks the value alone
 * (`eq:v`, or `empty`), a Ctrl or ⌘ click or Space adds it to the picked ones
 * (`in:a,b`), and clicking the only picked value again clears the filter.
 * `narrow`, the text typed in the filter, keeps the values containing it, asked
 * again of the server: past the first values of a column holding many, that is how
 * the others are reached. `options`, for a column holding a known set, lists each
 * of them, counted or not.
 */
export function ColumnValues({
  column,
  expr,
  onChange,
  fetchStats,
  queryKey,
  labelOf,
  narrow,
  options,
}: {
  /** Name of the column, as its header shows it. */
  column: string;
  /** Current filter of the column. */
  expr: string | undefined;
  onChange: (expr: string | undefined) => void;
  /** Reads the distribution, narrowed to the values containing `narrow`. */
  fetchStats: (narrow: string | undefined) => Promise<ValueStats>;
  /** Cache key of the distribution: the list, the column and the other filters. */
  queryKey: readonly unknown[];
  labelOf: (value: string) => ValueLabel;
  narrow?: string;
  /** The values of a column holding a known set, in their order. */
  options?: readonly string[];
}) {
  const { t, i18n } = useTranslation();
  const stats = useQuery({
    queryKey: [...queryKey, narrow ?? ""],
    queryFn: () => fetchStats(narrow),
    // Kept while the narrowing changes, not to empty the popover under the field.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  const picked = toPickedValues(expr);
  const inverted = isInverted(expr);

  function pick(value: string, add: boolean) {
    if (!add) {
      onChange(
        picked.length === 1 && picked[0] === value && !inverted
          ? undefined
          : fromPickedValues([value]),
      );
      return;
    }
    const next = picked.includes(value)
      ? picked.filter((other) => other !== value)
      : canPickWithOthers(value) && picked.every(canPickWithOthers)
        ? [...picked, value]
        : [value];
    onChange(fromPickedValues(next, inverted));
  }

  function valueName(value: string): { node: ReactNode; text: string } {
    if (value === EMPTY_VALUE) {
      const text = t("list.distribution.empty");
      return { node: <span className="text-ink-muted italic">{text}</span>, text };
    }
    const label = labelOf(value);
    return { node: label.render ?? label.text, text: label.text };
  }

  const data = stats.data;
  const counted = data?.values ?? [];
  // A known set lists all its values, those without a row at the end; values the
  // set does not know, from the data, follow the most frequent.
  const values =
    options === undefined
      ? counted
      : [
          ...counted,
          ...options
            .filter((option) => !counted.some((item) => item.value === option))
            .map((option) => ({ value: option, count: 0 })),
        ];
  const items: DistributionItem[] = values.map(({ value, count }) => {
    const name = valueName(value);
    return { key: value, label: name.node, text: name.text, count, picked: picked.includes(value) };
  });
  // Picked values the list does not show, past the most frequent: named, to be
  // found again by typing.
  const hidden = data === undefined ? [] : picked.filter((v) => !items.some((i) => i.key === v));
  const leftOut = data === undefined ? 0 : data.distinct - data.values.length;

  return (
    <section aria-label={t("list.distribution.title", { column })} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 border-t border-line px-1.5 pt-2">
        <h3 className="font-medium text-ink-muted">{t("list.distribution.values")}</h3>
        {data !== undefined && (
          <span className="shrink-0 text-ink-muted" aria-live="polite">
            {t("list.distribution.summary", {
              values: data.distinct,
              rows: data.total,
              count: data.distinct,
            })}
          </span>
        )}
      </div>
      {stats.isPending && <p className="px-1.5 text-ink-muted">{t("list.loading")}</p>}
      {stats.isError && (
        <p role="alert" className="px-1.5 text-state-down">
          ■ {stats.error.message}
        </p>
      )}
      {data !== undefined && data.total === 0 && options === undefined && (
        <p className="px-1.5 text-ink-muted">{t("list.distribution.none")}</p>
      )}
      {data !== undefined && items.length > 0 && (
        <>
          {inverted && picked.length > 0 && (
            <p className="px-1.5 text-state-warn">
              <span aria-hidden="true">≠ </span>
              {t("list.distribution.excluding")}
            </p>
          )}
          <Distribution
            items={items}
            total={data.total}
            label={t("list.distribution.title", { column })}
            locale={i18n.language}
            onPick={pick}
          />
          {leftOut > 0 && (
            <p className="px-1.5 text-ink-muted">
              {t("list.distribution.other", { count: leftOut, rows: data.other })}
            </p>
          )}
          {data.distinct === data.total && data.total > 1 && options === undefined && (
            <p className="px-1.5 text-ink-muted">{t("list.distribution.unique")}</p>
          )}
          <p className="px-1.5 text-ink-muted">{t("list.distribution.hint")}</p>
        </>
      )}
      {hidden.length > 0 && (
        <p className="px-1.5 text-ink-muted">
          {t("list.distribution.alsoPicked", {
            values: hidden.map((value) => valueName(value).text).join(", "),
          })}
        </p>
      )}
    </section>
  );
}
