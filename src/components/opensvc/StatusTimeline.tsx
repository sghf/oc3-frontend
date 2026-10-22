import { useId, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatDuration, parseCollectorDate } from "@/lib/format";
import { Timeline, type TimelineRange, type TimelineTrack } from "@/components/ui/Timeline";
import { Switch } from "@/components/ui/Switch";
import { AlertTriangleIcon, CloseIcon, PencilIcon } from "@/components/ui/icons";
import { statusBadge } from "./status";
import { dateTimeFormat } from "@/lib/date-format";

/** The justification of a period: why, whether it still counts, by whom and when. */
export interface StatusLogAck {
  comment: string;
  account: boolean;
  by: string;
  on: string;
}

/** A period of the status log: its dates, the value of each status then, its justification. */
export interface StatusLogPeriod {
  begin: string;
  end: string;
  values: Record<string, string>;
  ack?: StatusLogAck;
}

/** The availability rate of the period on display, as the server computes it. */
export interface StatusLogAvailability {
  rate: number;
  from: string;
  excludedSeconds: number;
}

export interface StatusLog {
  periods: StatusLogPeriod[];
  availability?: StatusLogAvailability;
}

/**
 * Justifying the periods of a track: who may, and the calls that store and remove
 * a justification, a period being named by its bounds.
 */
export interface StatusJustify {
  /** The track whose periods are justified. */
  track: string;
  canEdit: boolean;
  save: (begin: string, end: string, comment: string, account: boolean) => Promise<string | null>;
  remove: (begin: string, end: string) => Promise<string | null>;
}

const PERIODS = [1, 7, 30] as const;
type Period = (typeof PERIODS)[number];

/**
 * The last period is the current status, extended to now when the last status was
 * received recently; an older one means the object stopped reporting, which is
 * left as a hole rather than drawn as if the status held.
 */
const FRESH = 15 * 60;

/** Values during which the object is available: nothing to justify. */
const AVAILABLE = new Set(["up", "stdby up"]);

const seconds = (value: string) => {
  const date = parseCollectorDate(value);
  return date === null ? null : Math.floor(date.getTime() / 1000);
};

/** A range of the timeline, with the period it was drawn from. */
interface PeriodRange extends TimelineRange {
  period?: StatusLogPeriod;
}

/**
 * Ranges of one status of the log, the colour of the value as its badge has it, the
 * value itself as the label. Consecutive periods of the same value are merged, but
 * on a justified track, where a range is one period, named by its bounds.
 */
function rangesOf(
  periods: StatusLogPeriod[],
  key: string,
  now: number,
  merge: boolean,
  justifiedNote: (ack: StatusLogAck) => string,
): PeriodRange[] {
  const ranges: PeriodRange[] = [];
  periods.forEach((period, index) => {
    const start = seconds(period.begin);
    let end = seconds(period.end);
    const value = period.values[key];
    if (start === null || end === null || value === undefined) return;
    const last = index === periods.length - 1;
    const ongoing = last && now - end < FRESH;
    if (ongoing) end = now;
    const previous = ranges[ranges.length - 1];
    // Contiguous periods of the same value are one range: within a minute.
    if (merge && previous !== undefined && previous.label === value && start - previous.end <= 60) {
      previous.end = Math.max(previous.end, end);
      previous.ongoing = ongoing;
      return;
    }
    const badge = statusBadge(value);
    ranges.push({
      key: `${key}/${String(start)}`,
      start,
      end,
      ongoing,
      tone: badge.state,
      label: value === "" ? "n/a" : value,
      note: period.ack === undefined ? undefined : justifiedNote(period.ack),
      period,
    });
  });
  return ranges;
}

/**
 * The status history of an object on a time axis, over a period chosen above it:
 * a track per status the log keeps (availability, overall), coloured and named by
 * value, as the status badges of the views, and the availability rate when the
 * server gives it. With `justify`, the owner of the object explains a period of
 * unavailability from the period list, and may leave it out of the rate.
 */
export function StatusTimeline({
  queryKey,
  load,
  tracks,
  locale,
  justify,
}: {
  queryKey: readonly unknown[];
  load: (days: number) => Promise<StatusLog>;
  /** The statuses to draw, a track each, in order; a lone one is not named. */
  tracks: { key: string; label: string }[];
  locale: string;
  justify?: StatusJustify;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [days, setDays] = useState<Period>(7);
  // The period opened in the details card, by track and start: it is found again
  // in the log once a justification reloaded it.
  const [selected, setSelected] = useState<string | null>(null);
  const log = useQuery({
    queryKey: [...queryKey, days],
    queryFn: () => load(days),
  });
  const now = Math.floor(Date.now() / 1000);
  const refresh = () => queryClient.invalidateQueries({ queryKey: [...queryKey] });
  const justifiedNote = (ack: StatusLogAck) =>
    t(ack.account ? "statusTimeline.justifiedNote" : "statusTimeline.justifiedExcludedNote", {
      comment: ack.comment,
    });

  let body;
  if (log.isPending) body = <p className="text-ink-muted">{t("list.loading")}</p>;
  else if (log.isError)
    body = (
      <p role="alert" className="text-state-down">
        ■ {log.error.message}
      </p>
    );
  else if (log.data.periods.length === 0)
    body = <p className="text-ink-muted">{t("statusTimeline.empty")}</p>;
  else {
    const timelineTracks: TimelineTrack[] = tracks.map((track) => ({
      key: track.key,
      label: tracks.length > 1 ? track.label : undefined,
      ranges: rangesOf(
        log.data.periods,
        track.key,
        now,
        justify?.track !== track.key,
        justifiedNote,
      ),
    }));
    const availability = log.data.availability;
    body = (
      <>
        {availability !== undefined && (
          <p>
            <span className="font-medium">
              {t("statusTimeline.rate", {
                rate: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                  availability.rate,
                ),
              })}
            </span>
            <span className="text-ink-muted">
              {" "}
              {t("statusTimeline.rateSince", {
                since: dateTimeFormat({
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(parseCollectorDate(availability.from) ?? new Date()),
              })}
              {availability.excludedSeconds > 0 &&
                ` · ${t("statusTimeline.rateExcluded", {
                  duration: formatDuration(availability.excludedSeconds, locale),
                })}`}
            </span>
          </p>
        )}
        <Timeline
          tracks={timelineTracks}
          now={now}
          from={now - days * 86400}
          locale={locale}
          labels={{
            title: t("statusTimeline.title"),
            ongoing: t("statusTimeline.ongoing"),
            start: t("statusTimeline.start"),
            end: t("statusTimeline.end"),
            duration: t("statusTimeline.duration"),
            showTable: t("statusTimeline.showTable"),
            status: t("statusTimeline.status"),
            track: t("statusTimeline.track"),
            action: t("statusTimeline.justification"),
            selectHint: t("statusTimeline.selectHint"),
          }}
          selected={selected ?? undefined}
          onSelect={(range, track) => {
            const key = `${track.key}/${range.key}`;
            setSelected(selected === key ? null : key);
          }}
          rowAction={
            justify === undefined
              ? undefined
              : (range, track) => {
                  const period = (range as PeriodRange).period;
                  if (track.key !== justify.track || period === undefined) return null;
                  return (
                    <JustifyCell
                      period={period}
                      justifiable={!range.ongoing && !AVAILABLE.has(period.values[track.key] ?? "")}
                      justify={justify}
                      onChanged={refresh}
                    />
                  );
                }
          }
        />
        {(() => {
          if (selected === null) return null;
          const track = timelineTracks.find((tr) => selected.startsWith(`${tr.key}/`));
          const range = track?.ranges.find((r) => `${track.key}/${r.key}` === selected) as
            PeriodRange | undefined;
          if (track === undefined || range === undefined) return null;
          return (
            <PeriodDetails
              range={range}
              trackLabel={
                tracks.length > 1 ? tracks.find((tr) => tr.key === track.key)?.label : undefined
              }
              justify={justify !== undefined && justify.track === track.key ? justify : undefined}
              locale={locale}
              onChanged={refresh}
              onClose={() => {
                setSelected(null);
              }}
            />
          );
        })()}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-data font-medium text-ink-muted">{t("statusTimeline.title")}</h4>
        <div role="group" aria-label={t("statusTimeline.period")} className="ml-auto flex gap-1">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={days === period}
              onClick={() => {
                setDays(period);
              }}
              className="h-6 rounded-full border border-line px-2.5 text-data text-ink-muted hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-ink"
            >
              {t("statusTimeline.days", { count: period })}
            </button>
          ))}
        </div>
      </div>
      {body}
    </div>
  );
}

const BUTTON =
  "inline-flex h-6 items-center gap-1 rounded-(--radius-control) border border-line px-2 text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-40";

/**
 * The justification of a period in the period list: its comment, whether it is left
 * out of the availability rate, by whom; for the owner, the form that writes or
 * changes it, and its removal. A period of availability, or the ongoing one, whose
 * end is not known yet, has nothing to justify.
 */
function JustifyCell({
  period,
  justifiable,
  justify,
  onChanged,
}: {
  period: StatusLogPeriod;
  justifiable: boolean;
  justify: StatusJustify;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const id = useId();
  const ack = period.ack;
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(ack?.comment ?? "");
  // The toggle disables the accounting: off by default, the period counts.
  const [excluded, setExcluded] = useState(ack !== undefined && !ack.account);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(call: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const refused = await call();
    setBusy(false);
    if (refused !== null) {
      setError(refused);
      return;
    }
    setEditing(false);
    await onChanged();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (comment.trim() === "") return;
    void run(() => justify.save(period.begin, period.end, comment.trim(), !excluded));
  }

  if (editing)
    return (
      <form onSubmit={onSubmit} className="flex min-w-56 flex-col gap-1.5 py-1">
        <label htmlFor={`${id}-comment`} className="sr-only">
          {t("statusTimeline.comment")}
        </label>
        <textarea
          id={`${id}-comment`}
          autoFocus
          rows={2}
          value={comment}
          placeholder={t("statusTimeline.comment")}
          onChange={(event) => {
            setComment(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // The panel closes on Escape: here it only gives the edit up.
              event.stopPropagation();
              setEditing(false);
            }
          }}
          className="w-full rounded-(--radius-control) border border-line bg-surface p-1.5"
        />
        <span className="flex items-center gap-2">
          <Switch
            checked={excluded}
            label={t("statusTimeline.exclude")}
            stateLabel={t(excluded ? "detail.yes" : "detail.no")}
            onChange={setExcluded}
          />
          {t("statusTimeline.exclude")}
        </span>
        {error !== null && (
          <span role="alert" className="flex items-center gap-1 text-state-down">
            <AlertTriangleIcon className="shrink-0" />
            {error}
          </span>
        )}
        <span className="flex gap-1.5">
          <button
            type="submit"
            disabled={busy || comment.trim() === ""}
            className="h-6 rounded-(--radius-control) bg-accent px-2 font-medium text-accent-ink disabled:opacity-60"
          >
            {t("statusTimeline.save")}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              setEditing(false);
            }}
          >
            {t("statusTimeline.cancel")}
          </button>
          {ack !== undefined && (
            <button
              type="button"
              disabled={busy}
              className={`${BUTTON} ml-auto hover:text-state-down`}
              onClick={() => void run(() => justify.remove(period.begin, period.end))}
            >
              {t("statusTimeline.remove")}
            </button>
          )}
        </span>
      </form>
    );

  if (ack !== undefined)
    return (
      <div className="flex flex-col gap-0.5">
        <span className="flex items-start gap-1">
          <span className="min-w-0">{ack.comment}</span>
          {justify.canEdit && (
            <button
              type="button"
              title={t("statusTimeline.edit")}
              aria-label={t("statusTimeline.edit")}
              onClick={() => {
                setComment(ack.comment);
                setExcluded(!ack.account);
                setEditing(true);
              }}
              className="shrink-0 rounded-(--radius-control) p-0.5 text-ink-muted hover:text-ink"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
        <span className="text-ink-muted">
          {ack.account ? t("statusTimeline.counted") : t("statusTimeline.excluded")} ·{" "}
          {t("statusTimeline.by", {
            by: ack.by,
            on: dateTimeFormat({ dateStyle: "medium" }).format(
              parseCollectorDate(ack.on) ?? new Date(),
            ),
          })}
        </span>
      </div>
    );

  if (!justifiable || !justify.canEdit) return null;
  return (
    <button
      type="button"
      className={BUTTON}
      onClick={() => {
        setComment("");
        setExcluded(false);
        setEditing(true);
      }}
    >
      {t("statusTimeline.justify")}
    </button>
  );
}

const SWATCH: Record<string, string> = {
  up: "bg-state-up",
  down: "bg-state-down",
  warn: "bg-state-warn",
  unknown: "bg-state-unknown",
};

/**
 * The details of the period chosen on the timeline: its status, dates and
 * duration, and its justification, to read or, for the owner, to write, change or
 * remove, as in the period list.
 */
function PeriodDetails({
  range,
  trackLabel,
  justify,
  locale,
  onChanged,
  onClose,
}: {
  range: PeriodRange;
  trackLabel: string | undefined;
  justify: StatusJustify | undefined;
  locale: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dateTime = dateTimeFormat({ dateStyle: "medium", timeStyle: "medium" });
  const period = range.period;
  const value = period === undefined ? undefined : Object.values(period.values)[0];
  const status = range.label ?? value ?? "";
  const justifiable = !range.ongoing && !AVAILABLE.has(status);
  return (
    <section
      aria-label={t("statusTimeline.details")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !(event.target instanceof HTMLTextAreaElement)) {
          // The panel closes on Escape: here it only closes the details.
          event.stopPropagation();
          onClose();
        }
      }}
      className="rounded-(--radius-control) border border-line bg-surface p-2 text-data"
    >
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-sm ${SWATCH[range.tone ?? "down"] ?? ""}`}
        />
        {trackLabel === undefined ? status : `${trackLabel}: ${status}`}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("detail.close")}
          title={t("detail.close")}
          className="ml-auto rounded-(--radius-control) p-0.5 text-ink-muted hover:text-ink"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-ink-muted">{t("statusTimeline.start")}</dt>
        <dd>{dateTime.format(new Date(range.start * 1000))}</dd>
        <dt className="text-ink-muted">{t("statusTimeline.end")}</dt>
        <dd>
          {range.ongoing === true
            ? t("statusTimeline.ongoing")
            : dateTime.format(new Date(range.end * 1000))}
        </dd>
        <dt className="text-ink-muted">{t("statusTimeline.duration")}</dt>
        <dd>{formatDuration(range.end - range.start, locale)}</dd>
        {justify !== undefined && period !== undefined && (
          <>
            <dt className="text-ink-muted">{t("statusTimeline.justification")}</dt>
            <dd>
              {period.ack === undefined && !justifiable ? (
                <span className="text-ink-muted">
                  {range.ongoing === true
                    ? t("statusTimeline.ongoingNoJustify")
                    : t("statusTimeline.availableNoJustify")}
                </span>
              ) : period.ack === undefined && !justify.canEdit ? (
                <span className="text-ink-muted">{t("statusTimeline.notJustified")}</span>
              ) : (
                <JustifyCell
                  key={`${period.begin}/${period.end}/${period.ack?.on ?? ""}`}
                  period={period}
                  justifiable={justifiable}
                  justify={justify}
                  onChanged={onChanged}
                />
              )}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
