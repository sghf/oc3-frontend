import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { CheckIcon } from "./icons";

export interface DistributionItem {
  key: string;
  /** What the line shows; `text` is its plain form, for assistive technologies. */
  label: ReactNode;
  text: string;
  count: number;
  picked: boolean;
}

/**
 * The values of a set ranked by frequency, each with its count, its share of
 * `total` and a bar of that share: a part-to-whole reading in one hue, which needs
 * no legend and no colour per value, and whose lines are large targets.
 *
 * A list box with multiple selection: a click or Enter picks a value alone, a
 * Ctrl or ⌘ click or Space adds or removes it; the arrows, Home and End walk the
 * lines. What a pick does is for the caller.
 */
export function Distribution({
  items,
  total,
  label,
  locale,
  onPick,
  formatCount,
  wide = false,
}: {
  items: DistributionItem[];
  total: number;
  /** Accessible name of the list. */
  label: string;
  locale: string;
  /** `add`: toggle the value within the picked ones rather than pick it alone. */
  onPick: (key: string, add: boolean) => void;
  /** How a line's count reads, a plain number by default: a size, say. */
  formatCount?: (n: number) => string;
  /**
   * Room for longer labels and values, a size say, out of the narrow filter
   * popover the defaults suit.
   */
  wide?: boolean;
}) {
  const [active, setActive] = useState(0);
  const lines = useRef<(HTMLDivElement | null)[]>([]);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const count = new Intl.NumberFormat(locale);

  const shown = (n: number) => (formatCount === undefined ? count.format(n) : formatCount(n));

  function share(n: number): string {
    if (total <= 0) return "";
    const ratio = n / total;
    return ratio > 0 && ratio < 0.01 ? `<${percent.format(0.01)}` : percent.format(ratio);
  }

  function focus(index: number) {
    const next = Math.max(0, Math.min(items.length - 1, index));
    setActive(next);
    lines.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number, key: string) {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = moves[event.key];
    if (target !== undefined) {
      event.preventDefault();
      focus(target);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick(key, event.key === " ");
    }
  }

  return (
    <div role="listbox" aria-label={label} aria-multiselectable="true" className="flex flex-col">
      {items.map((item, index) => {
        const ratio = total > 0 ? item.count / total : 0;
        return (
          <div
            key={item.key}
            ref={(element) => {
              lines.current[index] = element;
            }}
            role="option"
            aria-selected={item.picked}
            aria-label={`${item.text}: ${shown(item.count)} (${share(item.count)})`}
            tabIndex={index === Math.min(active, items.length - 1) ? 0 : -1}
            onClick={(event: MouseEvent) => {
              setActive(index);
              onPick(item.key, event.ctrlKey || event.metaKey);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index, item.key);
            }}
            className="flex cursor-pointer items-center gap-2 rounded-(--radius-control) px-1.5 py-1 hover:bg-surface focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-selected:bg-accent-soft"
          >
            <span
              aria-hidden="true"
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                item.picked ? "border-accent bg-accent text-accent-ink" : "border-line-strong"
              }`}
            >
              {item.picked && <CheckIcon className="h-3 w-3" />}
            </span>
            <span className={`${wide ? "w-56" : "w-32"} shrink-0 truncate`} title={item.text}>
              {item.label}
            </span>
            <span aria-hidden="true" className="h-2 min-w-12 flex-1 rounded-full bg-surface-sunken">
              <span
                className="block h-full rounded-full bg-accent"
                // At least a sliver: a value counted is never drawn as nothing.
                style={{ width: `${String(Math.max(ratio * 100, ratio > 0 ? 2 : 0))}%` }}
              />
            </span>
            <span
              aria-hidden="true"
              className={`${wide ? "w-20" : "w-12"} shrink-0 text-right whitespace-nowrap tabular-nums`}
            >
              {shown(item.count)}
            </span>
            <span
              aria-hidden="true"
              className="w-10 shrink-0 text-right text-ink-muted tabular-nums"
            >
              {share(item.count)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
