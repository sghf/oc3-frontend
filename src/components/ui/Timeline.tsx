import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatDuration } from "@/lib/format";

/** The colour of a range: a state, read with its label rather than alone. */
export type TimelineTone = "up" | "down" | "warn" | "unknown";

/** A period on the timeline, in seconds since the epoch; `ongoing` runs to now. */
export interface TimelineRange {
  key: string;
  start: number;
  end: number;
  ongoing?: boolean;
  /** Down by default. */
  tone?: TimelineTone;
  /** What the period was, such as a status, shown with its dates. */
  label?: string;
  /** A remark on the period, such as its justification, shown in the tooltip. */
  note?: string;
}

/** A row of the timeline, named when there are several. */
export interface TimelineTrack {
  key: string;
  label?: string;
  ranges: TimelineRange[];
}

/** The words of the timeline, translated by the caller. */
export interface TimelineLabels {
  /** Accessible name of the chart. */
  title: string;
  /** Text of an ongoing range end, such as "ongoing". */
  ongoing: string;
  start: string;
  end: string;
  duration: string;
  showTable: string;
  /** Header of the label column of the table, when the ranges carry one. */
  status?: string;
  /** Header of the track column of the table, when there are several tracks. */
  track?: string;
  /** Header of the action column of the table, when `rowAction` is given. */
  action?: string;
  /** How to open a period from the keyboard, read with the title when `onSelect` is given. */
  selectHint?: string;
}

const FILL: Record<TimelineTone, string> = {
  up: "fill-state-up",
  down: "fill-state-down",
  warn: "fill-state-warn",
  unknown: "fill-state-unknown",
};
const SWATCH: Record<TimelineTone, string> = {
  up: "bg-state-up",
  down: "bg-state-down",
  warn: "bg-state-warn",
  unknown: "bg-state-unknown",
};

const TRACK_HEIGHT = 22;
const TRACK_GAP = 6;
const AXIS = 18;
const PAD = { left: 8, right: 8, top: 6 };
/** Room for the names of the tracks, when there are several. */
const LABEL_WIDTH = 88;
/** A range drawn narrower would not be seen: one of a few seconds over weeks. */
const MIN_WIDTH = 3;

/**
 * Periods on a time axis, such as the occurrences of an alert or the statuses of
 * a service: a bar per period, on one or several named tracks, from `from` (the
 * first period by default) to now. Hovering a bar, or stepping through them with
 * the arrow keys once the chart has the focus (up and down change the track),
 * shows its label, start, end and duration; an ongoing period runs to the right
 * edge, its end read as ongoing. The labels of the ranges, coloured by their tone,
 * make the legend; a table lists the same periods, for whoever cannot read the
 * chart.
 */
export function Timeline({
  tracks,
  now,
  from,
  labels,
  locale,
  rowAction,
  tableOpen,
  onSelect,
  selected,
  legendOrder,
}: {
  tracks: TimelineTrack[];
  now: number;
  from?: number;
  labels: TimelineLabels;
  locale: string;
  /** Content of a last column of the table, by period, such as its justification. */
  rowAction?: (range: TimelineRange, track: TimelineTrack) => ReactNode;
  /** Unfolds the table from the start. */
  tableOpen?: boolean;
  /**
   * Called with the period clicked, or chosen with Enter from the keyboard: the
   * caller opens its details. The period selected is outlined.
   */
  onSelect?: (range: TimelineRange, track: TimelineTrack) => void;
  /** Key of the selected period, as `${track.key}/${range.key}`. */
  selected?: string;
  /**
   * Labels in the order the legend lists them, whatever ranges come first; the
   * labels not named follow, in their order of appearance.
   */
  legendOrder?: readonly string[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<{ track: number; range: number } | null>(null);

  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => {
      setWidth(Math.max(240, element.clientWidth));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const named = tracks.length > 1 || tracks.some((t) => t.label !== undefined);
  const all = tracks.flatMap((t) => t.ranges);
  const first = from ?? Math.min(now - 3600, ...all.map((r) => r.start));
  const span = Math.max(1, now - first);
  const left = PAD.left + (named ? LABEL_WIDTH : 0);
  const inner = width - left - PAD.right;
  const x = (t: number) => left + ((Math.max(t, first) - first) / span) * inner;
  const y = (track: number) => PAD.top + track * (TRACK_HEIGHT + TRACK_GAP);
  const height = y(tracks.length) - TRACK_GAP + AXIS;
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" });
  const axisFormat = new Intl.DateTimeFormat(
    locale,
    span <= 2 * 86400 ? { hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric" },
  );
  const tickCount = Math.max(2, Math.min(6, Math.floor(inner / 110)));
  const ticks = Array.from({ length: tickCount }, (_, i) => first + (span * i) / (tickCount - 1));
  const shown = active === null ? undefined : tracks[active.track]?.ranges[active.range];
  const endText = (r: TimelineRange) =>
    r.ongoing === true ? labels.ongoing : dateTime.format(new Date(r.end * 1000));
  const rank = (label: string | undefined) => {
    const index = legendOrder?.indexOf(label ?? "") ?? -1;
    return index === -1 ? Infinity : index;
  };
  const legend = [
    ...new Map(
      all.filter((r) => r.label !== undefined).map((r) => [r.label, r.tone ?? "down"] as const),
    ),
  ].sort(([a], [b]) => rank(a) - rank(b));
  const withLabels = legend.length > 0;

  function geometry(r: TimelineRange) {
    const x0 = x(r.start);
    const w = Math.max(MIN_WIDTH, x(r.end) - x0);
    return { x0: Math.min(x0, left + inner - w), w };
  }

  function nearest(clientX: number, clientY: number) {
    const element = box.current;
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    const px = clientX - rect.left;
    const track = Math.floor((clientY - rect.top - PAD.top) / (TRACK_HEIGHT + TRACK_GAP));
    const ranges = tracks[track]?.ranges;
    if (ranges === undefined) return null;
    let best = -1;
    let bestDistance = Infinity;
    ranges.forEach((r, i) => {
      const { x0, w } = geometry(r);
      const distance = px < x0 ? x0 - px : px > x0 + w ? px - x0 - w : 0;
      if (distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    // Beyond a few pixels of any bar, nothing is pointed at.
    return best >= 0 && bestDistance <= 6 ? { track, range: best } : null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = active ?? { track: 0, range: -1 };
    const ranges = tracks[current.track]?.ranges ?? [];
    let next: { track: number; range: number } | null = null;
    switch (event.key) {
      case "ArrowRight":
        next = { ...current, range: Math.min(ranges.length - 1, current.range + 1) };
        break;
      case "ArrowLeft":
        next = { ...current, range: Math.max(0, current.range - 1) };
        break;
      case "Home":
        next = { ...current, range: 0 };
        break;
      case "End":
        next = { ...current, range: ranges.length - 1 };
        break;
      case "ArrowDown":
      case "ArrowUp": {
        const track = Math.min(
          tracks.length - 1,
          Math.max(0, current.track + (event.key === "ArrowDown" ? 1 : -1)),
        );
        // No other track that way: the period on display stays.
        if (track === current.track) {
          event.preventDefault();
          return;
        }
        // The period of the other track at the same time.
        const at = ranges[current.range]?.start ?? first;
        const other = tracks[track]?.ranges ?? [];
        const index = other.findIndex((r) => r.end >= at);
        next = { track, range: index === -1 ? other.length - 1 : index };
        break;
      }
      case "Enter":
      case " ": {
        const range = tracks[current.track]?.ranges[current.range];
        const track = tracks[current.track];
        if (onSelect === undefined || range === undefined || track === undefined) return;
        event.preventDefault();
        onSelect(range, track);
        return;
      }
      case "Escape":
        if (active !== null) {
          event.stopPropagation();
          setActive(null);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    if (next.range >= 0 && tracks[next.track]?.ranges[next.range] !== undefined) setActive(next);
  }

  const rows = tracks.flatMap((track) =>
    [...track.ranges].reverse().map((r) => ({ track, range: r })),
  );

  return (
    <figure className="m-0 flex flex-col gap-2">
      <div
        ref={box}
        role="img"
        aria-label={
          onSelect === undefined || labels.selectHint === undefined
            ? labels.title
            : `${labels.title}. ${labels.selectHint}`
        }
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerMove={(event) => {
          setActive(nearest(event.clientX, event.clientY));
        }}
        onPointerLeave={() => {
          setActive(null);
        }}
        onClick={(event) => {
          if (onSelect === undefined) return;
          const hit = nearest(event.clientX, event.clientY);
          const track = hit === null ? undefined : tracks[hit.track];
          const range = hit === null ? undefined : track?.ranges[hit.range];
          if (track !== undefined && range !== undefined) onSelect(range, track);
        }}
        onBlur={() => {
          setActive(null);
        }}
        className={`relative rounded-(--radius-control) focus-visible:outline-2 focus-visible:outline-accent ${onSelect === undefined || active === null ? "" : "cursor-pointer"}`}
      >
        <svg width={width} height={height} aria-hidden="true" className="block">
          {tracks.map((track, ti) => (
            <g key={track.key}>
              {named && (
                <text
                  x={PAD.left}
                  y={y(ti) + TRACK_HEIGHT / 2 + 4}
                  className="fill-ink-muted text-[0.6875rem]"
                >
                  {track.label}
                </text>
              )}
              <rect
                x={left}
                y={y(ti)}
                width={inner}
                height={TRACK_HEIGHT}
                rx={4}
                className="fill-surface-sunken"
              />
              {track.ranges.map((r, ri) => {
                const { x0, w } = geometry(r);
                const isActive = active?.track === ti && active.range === ri;
                const isSelected = selected === `${track.key}/${r.key}`;
                return (
                  <rect
                    key={r.key}
                    x={x0}
                    y={y(ti)}
                    width={w}
                    height={TRACK_HEIGHT}
                    rx={2}
                    className={`${FILL[r.tone ?? "down"]} ${isActive || isSelected ? "" : active === null ? "opacity-80" : "opacity-40"} ${isSelected ? "stroke-ink" : ""}`}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                );
              })}
            </g>
          ))}
          {ticks.map((t, i) => (
            <text
              key={t}
              x={x(t)}
              y={height - 4}
              textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
              className="fill-ink-muted text-[0.6875rem]"
            >
              {axisFormat.format(new Date(t * 1000))}
            </text>
          ))}
        </svg>
        {shown !== undefined && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-(--radius-control) border border-line bg-surface-raised px-2 py-1 text-data shadow"
            style={{
              left: Math.min(Math.max(0, x(shown.start) - 40), width - 220),
              top: y(active.track) + TRACK_HEIGHT + 4,
            }}
          >
            {shown.label !== undefined && (
              <div className="flex items-center gap-1.5 font-medium">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-sm ${SWATCH[shown.tone ?? "down"]}`}
                />
                {named && tracks[active.track]?.label !== undefined
                  ? `${tracks[active.track]?.label ?? ""}: ${shown.label}`
                  : shown.label}
              </div>
            )}
            <div>
              <span className="text-ink-muted">{labels.start} </span>
              {dateTime.format(new Date(shown.start * 1000))}
            </div>
            <div>
              <span className="text-ink-muted">{labels.end} </span>
              {endText(shown)}
            </div>
            <div>
              <span className="text-ink-muted">{labels.duration} </span>
              {formatDuration(shown.end - shown.start, locale)}
            </div>
            {shown.note !== undefined && <div className="mt-0.5 max-w-64 italic">{shown.note}</div>}
          </div>
        )}
      </div>
      {withLabels && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-data text-ink-muted">
          {legend.map(([label, tone]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${SWATCH[tone]}`} />
              {label}
            </li>
          ))}
        </ul>
      )}
      <details className="text-data" open={tableOpen}>
        <summary className="cursor-pointer text-ink-muted">{labels.showTable}</summary>
        <table className="mt-1 w-full">
          <thead>
            <tr className="text-left text-ink-muted">
              {named && <th className="py-0.5 pr-3 font-normal">{labels.track}</th>}
              {withLabels && <th className="py-0.5 pr-3 font-normal">{labels.status}</th>}
              <th className="py-0.5 pr-3 font-normal">{labels.start}</th>
              <th className="py-0.5 pr-3 font-normal">{labels.end}</th>
              <th className="py-0.5 pr-3 font-normal">{labels.duration}</th>
              {rowAction !== undefined && <th className="py-0.5 font-normal">{labels.action}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ track, range: r }) => (
              <tr key={`${track.key}/${r.key}`} className="border-t border-line align-top">
                {named && <td className="py-0.5 pr-3">{track.label}</td>}
                {withLabels && <td className="py-0.5 pr-3">{r.label}</td>}
                <td className="py-0.5 pr-3">{dateTime.format(new Date(r.start * 1000))}</td>
                <td className="py-0.5 pr-3">{endText(r)}</td>
                <td className="py-0.5 pr-3">{formatDuration(r.end - r.start, locale)}</td>
                {rowAction !== undefined && <td className="py-0.5">{rowAction(r, track)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
