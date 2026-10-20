import type { ComponentType, SVGProps } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * The choice between two ways of seeing the same thing: a sunken track and a
 * raised thumb sliding to the option chosen, each named in words beside its icon.
 * A radio group, one stop of the keyboard path on the option chosen; the left and
 * right arrows switch from one to the other. The slide is skipped for whoever asks
 * for reduced motion.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  keyShortcuts,
  className = "",
}: {
  options: readonly [SegmentedOption<T>, SegmentedOption<T>];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  keyShortcuts?: string;
  /** Size and placement of the track. */
  className?: string;
}) {
  const [first, second] = options;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-keyshortcuts={keyShortcuts}
      className={`relative grid h-8 grid-cols-2 rounded-full bg-surface-sunken p-[3px] ${className}`}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        // Left and right choose; up and down go on through the page.
        event.preventDefault();
        event.stopPropagation();
        const next = value === first.value ? second.value : first.value;
        onChange(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
      }}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-surface-raised shadow-sm ring-1 ring-line transition-transform duration-200 ease-out motion-reduce:transition-none ${
          value === second.value ? "translate-x-full" : ""
        }`}
      />
      {options.map((option) => {
        const checked = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={option.value}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              onChange(option.value);
            }}
            className={`relative inline-flex items-center justify-center gap-1.5 rounded-full px-3 text-data font-medium whitespace-nowrap transition-colors ${
              checked ? "text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon width={13} height={13} className={checked ? "text-accent" : undefined} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
