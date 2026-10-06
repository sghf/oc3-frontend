import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ValueStats } from "@/lib/api/value-stats";
import { filtersKey, invertFilter, isInverted, type ColumnFilters } from "@/lib/column-filters";
import { EnumChecklist } from "@/components/ui/EnumFilter";
import { HoverPopover } from "@/components/ui/HoverPopover";
import { TextFilter, type TextOperator } from "@/components/ui/TextFilter";
import { FilterIcon } from "@/components/ui/icons";
import type { ListColumn } from "./CollectorList";
import { ColumnFamilyIcon } from "./ColumnFamily";
import { ColumnValues } from "./ColumnDistribution";
import { describeFilter, hasDistribution, narrowing, optionLabel } from "./list-filter-describe";

const OPERATORS: TextOperator[] = ["contains", "eq", "ne", "regex", "gt", "gte", "lt", "lte"];

/**
 * The filter of a column, in a compact popover opened from its header (see
 * HoverPopover): the operator and the text of a text column, or the values of a
 * column holding a known set; under them, when the view counts values, the
 * distribution of the column's values to pick from (ColumnValues); at the foot,
 * Exclude, which keeps the rows the filter leaves out, and Clear.
 *
 * The trigger is a funnel, red while a filter is set, its tooltip and accessible
 * name then naming the filter; `trigger` replaces it, for the chip of an active
 * filter.
 */
export function ColumnFilterPopover<T>({
  column,
  filters,
  onChange,
  valueStats,
  scope,
  trigger,
  triggerClassName,
}: {
  column: ListColumn<T>;
  /** Every filter of the list: those of the other columns narrow the values. */
  filters: ColumnFilters;
  onChange: (expr: string | undefined) => void;
  valueStats?: (prop: string, filters: ColumnFilters) => Promise<ValueStats>;
  /** What tells the lists apart in the cache: the page and its filterset. */
  scope: readonly unknown[];
  trigger?: ReactNode;
  triggerClassName?: string;
}) {
  const { t } = useTranslation();
  const name = t(column.labelKey);
  const expr = filters[column.prop];
  const active = expr !== undefined;
  const spec = column.filter ?? { kind: "text" as const };
  const options = spec.kind === "enum" ? spec.options : [];
  const withValues = valueStats !== undefined && hasDistribution(column);
  const others = Object.fromEntries(
    Object.entries(filters).filter(([prop]) => prop !== column.prop),
  );
  const described =
    expr === undefined
      ? ""
      : `${isInverted(expr) ? `${t("list.filters.not")} ` : ""}${describeFilter(column, expr, t)}`;

  return (
    <HoverPopover
      label={
        active
          ? t("list.filters.openActive", { column: name, filter: described })
          : t("list.filters.open", { column: name })
      }
      panelLabel={t("list.filters.label", { column: name })}
      trigger={trigger ?? <FilterIcon className="h-3 w-3" />}
      className={
        triggerClassName ??
        `flex h-5 w-5 shrink-0 items-center justify-center rounded-(--radius-control) hover:bg-surface-sunken ${
          active ? "text-state-down" : "text-ink-muted/60 hover:text-ink"
        }`
      }
    >
      {(close) => (
        <>
          <div className="flex items-center gap-1.5 px-1.5">
            <ColumnFamilyIcon family={column.family} />
            <h2 className="truncate font-semibold">{name}</h2>
          </div>

          {spec.kind === "text" && (
            <TextFilter
              value={expr}
              onChange={onChange}
              label={t("list.filters.label", { column: name })}
              invertLabel={t("list.filters.invert")}
              clearLabel={t("list.filters.clearOne", { column: name })}
              invalidLabel={(reason) => t("list.filters.invalidRegex", { reason })}
              placeholder={
                column.numeric === true ? t("list.filters.numberHint") : t("list.filters.textHint")
              }
              operators={{
                label: t("list.filters.operator"),
                names: Object.fromEntries(
                  OPERATORS.map((operator) => [operator, t(`list.filters.operators.${operator}`)]),
                ) as Record<TextOperator, string>,
              }}
              showInvert={false}
              // Enter applies the filter and closes the popover, the focus back on the funnel.
              onSubmit={close}
              roomy
            />
          )}

          {spec.kind === "enum" && !withValues && (
            <EnumChecklist
              value={expr}
              onChange={onChange}
              options={options.map((option) => ({
                value: option.value,
                label: optionLabel(option, t),
                render: option.render,
              }))}
              label={t("list.filters.label", { column: name })}
            />
          )}

          {withValues && (
            <ColumnValues
              column={name}
              expr={expr}
              onChange={onChange}
              queryKey={["valueStats", ...scope, column.prop, filtersKey(others)]}
              narrow={spec.kind === "text" ? narrowing(expr) : undefined}
              fetchStats={(narrow) =>
                valueStats(
                  column.prop,
                  narrow === undefined ? others : { ...others, [column.prop]: narrow },
                )
              }
              options={spec.kind === "enum" ? options.map((option) => option.value) : undefined}
              labelOf={(value) => {
                const option = options.find((candidate) => candidate.value === value);
                return option === undefined
                  ? { text: value }
                  : { text: optionLabel(option, t), render: option.render };
              }}
            />
          )}

          <div className="flex items-center justify-end gap-2 border-t border-line px-1.5 pt-2">
            <button
              type="button"
              disabled={!active}
              aria-pressed={expr !== undefined && isInverted(expr)}
              onClick={() => {
                if (expr !== undefined) onChange(invertFilter(expr));
              }}
              title={t("list.filters.invertOne", { column: name })}
              className="h-7 rounded-(--radius-control) border border-line px-2 disabled:opacity-40 aria-pressed:border-accent aria-pressed:bg-accent-soft"
            >
              <span aria-hidden="true" className="font-mono">
                ≠{" "}
              </span>
              {t("list.filters.exclude")}
            </button>
            <button
              type="button"
              disabled={!active}
              onClick={() => {
                onChange(undefined);
              }}
              className="h-7 rounded-(--radius-control) border border-line px-2 disabled:opacity-40"
            >
              {t("list.filters.clear")}
            </button>
          </div>
        </>
      )}
    </HoverPopover>
  );
}
