import { useTranslation } from "react-i18next";
import { Distribution } from "@/components/ui/Distribution";
import {
  toPickedValues,
  fromPickedValues,
  withFilter,
  type ColumnFilters,
} from "@/lib/column-filters";
import { formatSizeBytes } from "@/lib/format";
import { useSavesSummary, type SaveShareKey, type SavesSummary } from "./use-saves";

/** The column a share of each key filters the list on. */
const FILTER_PROP: Record<Exclude<SaveShareKey, "object">, string> = {
  app: "save_app",
  server: "save_server",
  group: "save_group",
};

/**
 * The size of the backups the filters keep, ranked two ways, as the charts of
 * the historical Saves view: by application, or by service and node when one
 * application is left; by backup server, or by group when one server is left.
 * A line picks its value as a filter of the list, a Ctrl or ⌘ click adds it.
 */
export function SavesCharts({
  filters,
  onFilters,
}: {
  filters: ColumnFilters;
  onFilters: (next: ColumnFilters) => void;
}) {
  const { t } = useTranslation();
  const apps = useSavesSummary("app", filters);
  const servers = useSavesSummary("server", filters);
  // One value left: the share below it, as the historical charts switch.
  const owners = useSavesSummary(apps.data?.data.length === 1 ? "object" : undefined, filters);
  const places = useSavesSummary(servers.data?.data.length === 1 ? "group" : undefined, filters);
  const owner = apps.data?.data.length === 1 ? owners : apps;
  const place = servers.data?.data.length === 1 ? places : servers;
  return (
    <div className="mb-4 grid gap-4 md:grid-cols-2">
      <Chart
        title={apps.data?.data.length === 1 ? t("saves.charts.byObject") : t("saves.charts.byApp")}
        by={apps.data?.data.length === 1 ? "object" : "app"}
        summary={owner.data}
        pending={owner.isPending}
        error={owner.isError ? owner.error.message : null}
        filters={filters}
        onFilters={onFilters}
      />
      <Chart
        title={
          servers.data?.data.length === 1 ? t("saves.charts.byGroup") : t("saves.charts.byServer")
        }
        by={servers.data?.data.length === 1 ? "group" : "server"}
        summary={place.data}
        pending={place.isPending}
        error={place.isError ? place.error.message : null}
        filters={filters}
        onFilters={onFilters}
      />
    </div>
  );
}

function Chart({
  title,
  by,
  summary,
  pending,
  error,
  filters,
  onFilters,
}: {
  title: string;
  by: SaveShareKey;
  summary: SavesSummary | undefined;
  pending: boolean;
  error: string | null;
  filters: ColumnFilters;
  onFilters: (next: ColumnFilters) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  // An object's key names its column: "svc_id:<id>" or "node_id:<id>".
  const target = (key: string) => {
    if (by !== "object") return { prop: FILTER_PROP[by], value: key };
    const [prop = "node_id", ...rest] = key.split(":");
    return { prop, value: rest.join(":") };
  };
  const picked = (key: string) => {
    const { prop, value } = target(key);
    return toPickedValues(filters[prop]).includes(value === "" ? "empty" : value);
  };
  return (
    <section className="rounded-(--radius-panel) border border-line p-3">
      <h2 className="mb-1 font-medium">{title}</h2>
      {summary !== undefined && (
        <p className="mb-2 text-ink-muted tabular-nums">
          {t("saves.charts.total", {
            size: formatSizeBytes(summary.total_size, locale) || "0",
            count: summary.total_count,
          })}
        </p>
      )}
      {error !== null ? (
        <p role="alert" className="text-state-down">
          ■ {error}
        </p>
      ) : pending && summary === undefined ? (
        <p className="text-ink-muted">{t("list.loading")}</p>
      ) : summary === undefined || summary.data.length === 0 ? (
        <p className="text-ink-muted">{t("saves.charts.none")}</p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <Distribution
            items={summary.data.map((share) => {
              const name = share.label === "" ? t("saves.charts.unknown") : share.label;
              return {
                key: share.key,
                label: (
                  <>
                    {name}
                    <span className="text-ink-muted">
                      {" "}
                      · {t("saves.charts.backups", { count: share.count })}
                    </span>
                  </>
                ),
                text: `${name}, ${t("saves.charts.backups", { count: share.count })}`,
                count: share.size,
                picked: picked(share.key),
              };
            })}
            total={summary.total_size}
            label={title}
            locale={locale}
            formatCount={(n) => formatSizeBytes(n, locale) || "0"}
            wide
            onPick={(key, add) => {
              const { prop, value } = target(key);
              const v = value === "" ? "empty" : value;
              const current = toPickedValues(filters[prop]);
              const next = add
                ? current.includes(v)
                  ? current.filter((x) => x !== v)
                  : [...current, v]
                : current.length === 1 && current[0] === v
                  ? []
                  : [v];
              onFilters(withFilter(filters, prop, fromPickedValues(next)));
            }}
          />
        </div>
      )}
    </section>
  );
}
