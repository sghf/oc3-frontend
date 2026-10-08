import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  FILTER_OPERATORS,
  FILTER_TABLES,
  isFilterOperator,
  type FilterDefinition,
} from "./filter-definition";

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

/**
 * The definition of a filter: its table, column, operator and value, then the
 * condition they make. Shared by the form of the Filters view (`stacked`, a field
 * per line) and the creation of a filter within a filterset (`inline`, the four on
 * one line where the width allows), so that both ask the same thing.
 *
 * `fieldSuggestions` offers the columns already used on the table; any other may
 * be typed.
 */
export function FilterFields({
  definition,
  onChange,
  idPrefix,
  layout = "stacked",
  fieldSuggestions = [],
  autoFocus = false,
}: {
  definition: FilterDefinition;
  onChange: (definition: FilterDefinition) => void;
  idPrefix: string;
  layout?: "stacked" | "inline";
  fieldSuggestions?: readonly string[];
  /** The first field takes the focus: the form has just been opened on purpose. */
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof FilterDefinition>(key: K, value: FilterDefinition[K]) => {
    onChange({ ...definition, [key]: value });
  };
  const inline = layout === "inline";
  const field = (key: string, label: string, control: ReactNode, hint?: string) => (
    <div className={inline ? "min-w-0" : "mb-3"}>
      <label
        className={inline ? "mb-0.5 block text-data text-ink-muted" : "mb-1 block font-medium"}
        htmlFor={`${idPrefix}-${key}`}
      >
        {label}
      </label>
      {control}
      {hint !== undefined && <p className="mt-1 text-ink-muted">{hint}</p>}
    </div>
  );

  return (
    <>
      <div
        className={inline ? "grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr_6rem_1fr]" : undefined}
      >
        {field(
          "table",
          t("filters.fields.f_table"),
          <select
            id={`${idPrefix}-table`}
            value={definition.f_table}
            // The form was opened to write a filter: it starts there.
            autoFocus={autoFocus}
            onChange={(event) => {
              set("f_table", event.target.value);
            }}
            className={INPUT}
          >
            {FILTER_TABLES.map((table) => (
              <option key={table} value={table}>
                {table}
              </option>
            ))}
          </select>,
        )}
        {field(
          "field",
          t("filters.fields.f_field"),
          <>
            <input
              id={`${idPrefix}-field`}
              required
              list={fieldSuggestions.length > 0 ? `${idPrefix}-fields` : undefined}
              value={definition.f_field}
              onChange={(event) => {
                set("f_field", event.target.value);
              }}
              placeholder={t("filters.form.fieldPlaceholder")}
              className={INPUT}
            />
            {fieldSuggestions.length > 0 && (
              <datalist id={`${idPrefix}-fields`}>
                {fieldSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
          </>,
        )}
        {field(
          "op",
          t("filters.fields.f_op"),
          <select
            id={`${idPrefix}-op`}
            value={definition.f_op}
            onChange={(event) => {
              if (isFilterOperator(event.target.value)) set("f_op", event.target.value);
            }}
            className={INPUT}
          >
            {FILTER_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>,
        )}
        {field(
          "value",
          t("filters.fields.f_value"),
          <input
            id={`${idPrefix}-value`}
            required
            value={definition.f_value}
            onChange={(event) => {
              set("f_value", event.target.value);
            }}
            className={INPUT}
          />,
          inline ? undefined : t("filters.form.valueHint"),
        )}
      </div>
      {inline && <p className="mt-1 text-ink-muted">{t("filters.form.valueHint")}</p>}
      <p className={inline ? "mt-1 text-ink-muted" : "mb-3 text-ink-muted"}>
        {t("filters.form.preview")}{" "}
        <code className="text-ink">
          {definition.f_table}.{definition.f_field} {definition.f_op} {definition.f_value}
        </code>
      </p>
    </>
  );
}
