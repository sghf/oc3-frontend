/** Track, knob and knob offsets of each size. */
const SIZES = {
  md: {
    track: "h-5 w-9",
    knob: "h-3.5 w-3.5",
    on: "translate-x-[1.125rem]",
    off: "translate-x-[0.1875rem]",
  },
  sm: {
    track: "h-4 w-7",
    knob: "h-3 w-3",
    on: "translate-x-[0.75rem]",
    off: "translate-x-[0.125rem]",
  },
} as const;

/**
 * Switch for a boolean value.
 *
 * The state reads from the knob position as much as from the colour, and
 * `role="switch"` with `aria-checked` conveys it to assistive technologies: it does
 * not rely on colour alone. Disabled, it stays readable and serves as a display.
 * `size="sm"` fits it to a table row, a little smaller than in a form or a panel.
 */
export function Switch({
  checked,
  label,
  stateLabel,
  disabled = false,
  size = "md",
  onChange,
}: {
  checked: boolean;
  /** Name of the property, for the accessible label. */
  label: string;
  /** Label of the current state, announced and shown as a tooltip. */
  stateLabel: string;
  disabled?: boolean;
  size?: "md" | "sm";
  onChange?: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} : ${stateLabel}`}
      title={stateLabel}
      disabled={disabled}
      onClick={() => {
        onChange?.(!checked);
      }}
      className={`inline-flex shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${
        SIZES[size].track
      } ${checked ? "border-accent bg-accent" : "border-line bg-surface-sunken"}`}
    >
      <span
        aria-hidden="true"
        className={`rounded-full transition-transform ${SIZES[size].knob} ${
          checked ? `${SIZES[size].on} bg-accent-ink` : `${SIZES[size].off} bg-line-strong`
        }`}
      />
    </button>
  );
}
