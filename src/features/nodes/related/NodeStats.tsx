import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components, paths } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { TimeChart, type TimeSeries } from "@/components/ui/TimeChart";
import { dateTimeFormat } from "@/lib/date-format";

type NodeStatSeries = components["schemas"]["NodeStatSeries"];
type Group = NonNullable<paths["/nodes/{node_id}/stats"]["get"]["parameters"]["query"]>["group"];

/** The periods offered, in days. */
const PERIODS = [1, 7, 30, 90, 365] as const;
type Period = (typeof PERIODS)[number];

/** The longest span the API serves, in days. */
const MAX_DAYS = 1095;
const DAY_MS = 24 * 3600 * 1000;

/** The period of the charts: the last days, or a range of calendar days, both included. */
type Range = { days: Period } | { begin: string; end: string };

/** A local date as a date input holds it, YYYY-MM-DD. */
function dateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The query bounds of a range of calendar days: from the start of the first day to
 * the start of the day after the last, in the browser time zone. Undefined when
 * the range is reversed, incomplete or longer than the API serves.
 */
function rangeBounds(begin: string, end: string): { begin: string; end: string } | undefined {
  const from = new Date(`${begin}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return undefined;
  to.setDate(to.getDate() + 1);
  if (to <= from || to.getTime() - from.getTime() > MAX_DAYS * DAY_MS) return undefined;
  return { begin: from.toISOString(), end: to.toISOString() };
}

const GROUPS: readonly Group[] = [
  "cpu",
  "proc",
  "mem",
  "swap",
  "block",
  "netdev",
  "netdev_err",
  "blockdev",
  "fs",
  "svc",
];

const PERIOD_BUTTON =
  "h-7 rounded-full border border-line px-3 text-ink-muted hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-ink";

/**
 * The charts of the tab: each takes some metrics of a group — those of one unit,
 * since a chart has a single axis — named as the historical collector's charts
 * did. A chart of a group by device takes the metrics of every device.
 */
const CHARTS: {
  key: string;
  group: Group;
  metrics: string[];
  unit?: string;
  /** The values are divided by it: the agent sends some in a unit too small to read. */
  scale?: number;
  stack?: boolean;
}[] = [
  {
    key: "cpu",
    group: "cpu",
    // idle is what is left: stacked under the others it would fill the chart.
    metrics: ["usr", "nice", "sys", "iowait", "steal", "irq", "soft", "guest"],
    unit: "%",
    stack: true,
  },
  { key: "load", group: "proc", metrics: ["ldavg_1", "ldavg_5", "ldavg_15", "runq_sz"] },
  { key: "mem", group: "mem", metrics: ["pct_memused", "pct_commit"], unit: "%" },
  { key: "swap", group: "swap", metrics: ["pct_swpused", "pct_swpcad"], unit: "%" },
  { key: "iops", group: "block", metrics: ["rtps", "wtps"], unit: "/s" },
  { key: "blockThroughput", group: "block", metrics: ["rbps", "wbps"], unit: "blocks/s" },
  { key: "netBandwidth", group: "netdev", metrics: ["rxkBps", "txkBps"], unit: "kB/s" },
  { key: "netPackets", group: "netdev", metrics: ["rxpckps", "txpckps"], unit: "/s" },
  {
    key: "netErrors",
    group: "netdev_err",
    metrics: ["rxerrps", "txerrps", "collps", "rxdropps", "txdropps"],
    unit: "/s",
  },
  { key: "diskUtil", group: "blockdev", metrics: ["pct_util"], unit: "%" },
  { key: "diskWait", group: "blockdev", metrics: ["await"], unit: "ms" },
  { key: "diskOps", group: "blockdev", metrics: ["tps"], unit: "/s" },
  // By mount point: the agent sends the used share in percent and the size in KB.
  { key: "fsUsed", group: "fs", metrics: ["used"], unit: "%" },
  { key: "fsSize", group: "fs", metrics: ["size"], unit: "GB", scale: 1024 * 1024 },
  // By container, with the units of the historical charts.
  { key: "svcCpu", group: "svc", metrics: ["cpu"], unit: "%" },
  { key: "svcCpuCap", group: "svc", metrics: ["cap_cpu"] },
  { key: "svcMem", group: "svc", metrics: ["mem"], unit: "%" },
  { key: "svcMemCap", group: "svc", metrics: ["cap"], unit: "MB" },
  { key: "svcRss", group: "svc", metrics: ["rss"], unit: "MB" },
  { key: "svcSwap", group: "svc", metrics: ["swap"], unit: "MB" },
  { key: "svcNproc", group: "svc", metrics: ["nproc"] },
  { key: "svcPg", group: "svc", metrics: ["pg", "avgpg"], unit: "MB" },
  { key: "svcAt", group: "svc", metrics: ["at", "avgat"], unit: "MB" },
];

/**
 * The performance statistics of a node, as the historical node stats tab showed
 * them: CPU, load, memory, swap, block I/O, network, block devices, file systems
 * and containers, over a period chosen above the charts — the last days, or a
 * range of calendar days. A chart without data for the period is left out;
 * a node with no statistics at all says so.
 */
export function NodeStats({ nodeId, locale }: { nodeId: string; locale: string }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>({ days: 1 });
  const bounds = "days" in range ? undefined : rangeBounds(range.begin, range.end);
  const invalidRange = !("days" in range) && bounds === undefined;
  const queries = useQueries({
    queries: GROUPS.map((group) => ({
      queryKey: ["node", nodeId, "stats", group, "days" in range ? range.days : bounds],
      enabled: !invalidRange,
      queryFn: async () => {
        const { data, error } = await api.GET("/nodes/{node_id}/stats", {
          params: {
            path: { node_id: nodeId },
            query: { group, ...("days" in range ? { days: range.days } : bounds) },
          },
        });
        if (error !== undefined) throw new Error(problemText(error));
        return data.data;
      },
    })),
  });
  const byGroup = new Map(GROUPS.map((group, index) => [group, queries[index]]));
  const pending = !invalidRange && queries.some((query) => query.isPending);
  const dateFormat = dateTimeFormat({ dateStyle: "medium" });
  const periodLabel =
    "days" in range
      ? t("nodes.stats.days", { count: range.days })
      : t("nodes.stats.range", {
          begin: dateFormat.format(new Date(`${range.begin}T00:00:00`)),
          end: dateFormat.format(new Date(`${range.end}T00:00:00`)),
        });
  const failed = queries.find((query) => query.isError);

  const charts = CHARTS.flatMap((chart) => {
    const rows: NodeStatSeries[] = byGroup.get(chart.group)?.data ?? [];
    const series: TimeSeries[] = rows
      .filter((row) => chart.metrics.includes(row.metric) && row.points.length > 0)
      .sort(
        (a, b) =>
          (a.device ?? "").localeCompare(b.device ?? "") ||
          chart.metrics.indexOf(a.metric) - chart.metrics.indexOf(b.metric),
      )
      .map((row) => ({
        key: `${row.device ?? ""}/${row.metric}`,
        name: `${row.device === undefined ? "" : `${row.device} `}${t(`nodes.stats.metrics.${row.metric}`, { defaultValue: row.metric })}`,
        points: row.points.flatMap((p): [number, number][] =>
          p[0] === undefined || p[1] === undefined ? [] : [[p[0], p[1] / (chart.scale ?? 1)]],
        ),
      }));
    return series.length === 0 ? [] : [{ ...chart, series }];
  });

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={t("nodes.stats.period")} className="flex flex-wrap gap-1">
        {PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={"days" in range && range.days === period}
            onClick={() => {
              setRange({ days: period });
            }}
            className={PERIOD_BUTTON}
          >
            {t("nodes.stats.days", { count: period })}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={!("days" in range)}
          onClick={() => {
            if (!("days" in range)) return;
            // Starts from the period shown, so that the chart does not jump.
            const today = new Date();
            const first = new Date(today.getTime() - (range.days - 1) * DAY_MS);
            setRange({ begin: dateInputValue(first), end: dateInputValue(today) });
          }}
          className={PERIOD_BUTTON}
        >
          {t("nodes.stats.custom")}
        </button>
      </div>
      {"days" in range ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            <span className="text-ink-muted">{t("nodes.stats.begin")}</span>
            <input
              type="date"
              value={range.begin}
              max={range.end}
              onChange={(event) => {
                setRange({ ...range, begin: event.target.value });
              }}
              className="h-7 rounded-md border border-line bg-surface px-2"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-ink-muted">{t("nodes.stats.end")}</span>
            <input
              type="date"
              value={range.end}
              min={range.begin}
              onChange={(event) => {
                setRange({ ...range, end: event.target.value });
              }}
              className="h-7 rounded-md border border-line bg-surface px-2"
            />
          </label>
        </div>
      )}
      {invalidRange ? (
        <p role="alert" className="text-state-warn">
          ▲ {t("nodes.stats.invalidRange", { count: MAX_DAYS })}
        </p>
      ) : failed?.isError === true ? (
        <p role="alert" className="text-state-down">
          ■ {failed.error.message}
        </p>
      ) : pending ? (
        <p className="text-ink-muted">{t("list.loading")}</p>
      ) : charts.length === 0 ? (
        <p className="text-ink-muted">{t("nodes.stats.empty")}</p>
      ) : (
        charts.map((chart) => (
          <section key={chart.key} className="flex flex-col gap-1">
            <h3 className="font-semibold">{t(`nodes.stats.charts.${chart.key}`)}</h3>
            <TimeChart
              series={chart.series}
              stack={chart.stack === true}
              // Shares do not add up: the folded devices show their highest value.
              fold={chart.unit === "%" ? "max" : "sum"}
              unit={chart.unit}
              locale={locale}
              labels={{
                title: t("nodes.stats.chartLabel", {
                  name: t(`nodes.stats.charts.${chart.key}`),
                  period: periodLabel,
                }),
                other: chart.unit === "%" ? t("nodes.stats.otherMax") : t("reports.preview.other"),
                table: t("reports.preview.chartTable"),
                date: t("reports.preview.date"),
                total: t("reports.preview.total"),
              }}
            />
          </section>
        ))
      )}
    </div>
  );
}
