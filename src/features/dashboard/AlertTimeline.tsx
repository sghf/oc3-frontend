import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { formatDuration, parseCollectorDate } from "@/lib/format";
import { Timeline, type TimelineRange } from "@/components/ui/Timeline";
import { dateTimeFormat } from "@/lib/date-format";

const seconds = (value: string | null | undefined) => {
  const date = parseCollectorDate(value ?? undefined);
  return date === null ? null : Math.floor(date.getTime() / 1000);
};

/**
 * The occurrences of an alert on a time axis, as the timeline of the historical
 * alert properties (`alert_timeline`): the past ones the dashboard recorded
 * (`GET /alerts/{id}/events`), and the current one, from the creation of the alert
 * to now, when the database recorded no open occurrence for it: the alert being
 * on display is active.
 */
export function AlertTimeline({
  alertId,
  created,
  locale,
}: {
  alertId: string;
  /** dash_created of the alert, the start of its current occurrence. */
  created: string | undefined;
  locale: string;
}) {
  const { t } = useTranslation();
  const events = useQuery({
    queryKey: ["alert", alertId, "events"],
    queryFn: async () => {
      const { data, error } = await api.GET("/alerts/{id}/events", {
        params: { path: { id: alertId } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
  const now = Math.floor(Date.now() / 1000);

  if (events.isPending) return <p className="text-ink-muted">{t("list.loading")}</p>;
  if (events.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {events.error.message}
      </p>
    );

  const ranges: TimelineRange[] = events.data.data.flatMap((e) => {
    const start = seconds(e.begin);
    if (start === null) return [];
    const end = seconds(e.end);
    return [{ key: String(e.id), start, end: end ?? now, ongoing: end === null }];
  });
  const createdAt = seconds(created);
  const last = ranges[ranges.length - 1];
  if (createdAt !== null && last?.ongoing !== true && (last === undefined || last.end <= createdAt))
    ranges.push({ key: "current", start: createdAt, end: now, ongoing: true });

  const first = ranges[0];
  const total = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
  return (
    <div className="flex flex-col gap-1">
      {first !== undefined && (
        <p className="text-ink-muted">
          {t("dashboard.timeline.summary", {
            count: ranges.length,
            since: dateTimeFormat({ dateStyle: "medium" }).format(new Date(first.start * 1000)),
            total: formatDuration(total, locale),
          })}
          {events.data.truncated === true && ` ${t("dashboard.timeline.truncated")}`}
        </p>
      )}
      <Timeline
        tracks={[{ key: "alert", ranges }]}
        now={now}
        locale={locale}
        labels={{
          title: t("dashboard.timeline.title"),
          ongoing: t("dashboard.timeline.ongoing"),
          start: t("dashboard.timeline.start"),
          end: t("dashboard.timeline.end"),
          duration: t("dashboard.timeline.duration"),
          showTable: t("dashboard.timeline.showTable"),
        }}
      />
    </div>
  );
}
