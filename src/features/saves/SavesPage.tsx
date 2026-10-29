import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import { formatSizeBytes } from "@/lib/format";
import {
  mergeSearch,
  resetsScroll,
  resolveListSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { SaveDetailPanel } from "./SaveDetailPanel";
import { SavesCharts } from "./SavesCharts";
import { SAVE_PROPS, fetchSaves, saveStats, useSaves, type SaveRow } from "./use-saves";

const DEFAULT_SORT = ["-save_date"];

/** The columns the historical view shows by default. */
const DEFAULT_COLS: string[] = [
  "save_server",
  "save_app",
  "nodename",
  "svcname",
  "save_name",
  "save_group",
  "save_level",
  "save_size",
  "save_volume",
  "save_date",
  "save_retention",
];

const DATE_PROPS = new Set<string>(["save_date", "save_retention"]);

const FAMILY: Record<string, ColumnFamily> = {
  save_app: "app",
  node_id: "node",
  nodename: "node",
  svc_id: "service",
  svcname: "service",
  save_date: "time",
  save_retention: "time",
};

const COLUMNS: ListColumn<SaveRow>[] = SAVE_PROPS.map((prop) => ({
  prop,
  labelKey: `saves.fields.${prop}`,
  numeric: prop === "id" || prop === "save_size",
  family: FAMILY[prop] ?? "disk",
  // The sizes read in their distribution as in the cells.
  formatValue:
    prop === "save_size"
      ? (value: string, locale: string) =>
          value === "" || Number.isNaN(Number(value))
            ? value
            : formatSizeBytes(Number(value), locale) || value
      : undefined,
  render: (row: SaveRow, locale: string) => {
    const value = row[prop];
    if (prop === "save_app")
      return (
        <CrossLink kind="app" id={row.save_app === "" ? undefined : row.save_app}>
          {row.save_app}
        </CrossLink>
      );
    if (prop === "nodename")
      return (
        <CrossLink kind="node" id={row.node_id === "" ? undefined : row.node_id}>
          {row.nodename}
        </CrossLink>
      );
    if (prop === "svcname")
      return (
        <CrossLink kind="service" id={row.svc_id === "" ? undefined : row.svc_id}>
          {row.svcname}
        </CrossLink>
      );
    if (prop === "save_size") return formatSizeBytes(row.save_size, locale) || "0";
    if (DATE_PROPS.has(prop) && typeof value === "string") return <DateTime value={value} />;
    return value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/**
 * The backups the backup servers index, the historical Saves view: what was
 * saved, from which node or service, by which server and group, how large,
 * when, and until when it is kept; above them, their size by application or
 * object and by server or group, which also filters the list. A row opens its
 * backup in a panel.
 */
export function SavesPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("saves");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/saves" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/saves" });
  const shown = visibleProps(search.cols, DEFAULT_COLS, ALL_PROPS);
  const { data, isPending, isError, error, isFetching } = useSaves(search, shown);

  function update(next: Partial<ResolvedListSearch>) {
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="save" className="h-5 w-5" />
          {t("saves.title")}
        </h1>
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("saves.intro")}</p>

      <SavesCharts
        filters={search.filters}
        onFilters={(filters) => {
          // A new selection starts on its first page.
          update({ filters, offset: 0 });
        }}
      />

      <CollectorList
        viewPrefs={prefs}
        valueStats={saveStats}
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchSaves({ ...search, ...page }, shown)}
        total={data?.total}
        filterable
      />

      <SaveDetailPanel
        saveId={search.sel}
        label={data?.rows.find((row) => String(row.id) === search.sel)?.save_name ?? ""}
        onClose={() => {
          update({ sel: undefined });
        }}
      />
    </section>
  );
}
