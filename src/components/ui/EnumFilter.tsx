import { type ReactNode } from "react";
import { fromEnumValues, isInverted, toEnumValues } from "@/lib/column-filters";

export interface EnumFilterOption {
  value: string;
  /** Plain label: for assistive technologies. */
  label: string;
  /** Rendering in the list, as the cells show the value; the label otherwise. */
  render?: ReactNode;
}

/**
 * Filter of a column holding a known set of values, where no counts of them are
 * at hand: a checkbox per value. Each ticked value widens the filter (`in:a,b`);
 * nothing ticked clears it; an inverted filter (`!in:a,b`), set elsewhere, stays
 * inverted. Every change applies at once.
 */
export function EnumChecklist({
  value,
  onChange,
  options,
  label,
}: {
  value: string | undefined;
  onChange: (expr: string | undefined) => void;
  options: EnumFilterOption[];
  /** Accessible name of the list. */
  label: string;
}) {
  const chosen = toEnumValues(value);
  const inverted = isInverted(value);

  function toggle(item: string) {
    const next = chosen.includes(item)
      ? chosen.filter((other) => other !== item)
      : [...chosen, item];
    onChange(fromEnumValues(next, inverted));
  }

  return (
    <fieldset className="flex flex-col">
      <legend className="sr-only">{label}</legend>
      {options.map((option, index) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-2 rounded-(--radius-control) px-2 py-1 font-normal text-ink hover:bg-surface"
        >
          <input
            type="checkbox"
            data-autofocus={index === 0 ? true : undefined}
            checked={chosen.includes(option.value)}
            onChange={() => {
              toggle(option.value);
            }}
          />
          {option.render ?? option.label}
        </label>
      ))}
    </fieldset>
  );
}
