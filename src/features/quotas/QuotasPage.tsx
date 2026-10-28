import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { formatCapacityMiB } from "@/lib/format";
import {
  mergeSearch,
  resetsScroll,
  resolveListSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { CreateQuotaPanel } from "./CreateQuotaPanel";
import { QuotaDetailPanel } from "./QuotaDetailPanel";
import { QuotaUsage } from "./quota-parts";
import {
  QUOTA_PROPS,
  fetchQuotas,
  quotaStats,
  useCanManageQuotas,
  useQuotas,
  type QuotaRow,
} from "./use-quotas";

const DEFAULT_SORT = ["array_name", "dg_name", "app"];

/**
 * Shown by default: where the quota is, for which application, how large and how
 * full, and what the disk group can still reserve.
 */
const DEFAULT_COLS: string[] = [
  "array_name",
  "dg_name",
  "app",
  "quota",
  "quota_used",
  "dg_size",
  "dg_reservable",
];

/** Sizes, in MiB in the collector. */
const SIZE_PROPS = new Set<string>([
  "dg_size",
  "dg_reserved",
  "dg_reservable",
  "dg_used",
  "dg_free",
  "quota",
  "quota_used",
]);

const NUMERIC_PROPS = new Set<string>([...SIZE_PROPS, "id", "array_id", "dg_id", "app_id"]);

const FAMILY: Record<string, ColumnFamily> = {
  app: "app",
  app_id: "app",
};

const COLUMNS: ListColumn<QuotaRow>[] = QUOTA_PROPS.map((prop) => ({
  prop,
  labelKey: `quotas.fields.${prop}`,
  numeric: NUMERIC_PROPS.has(prop),
  family: FAMILY[prop] ?? "disk",
  // The sizes read in their distribution as in the cells.
  formatValue: SIZE_PROPS.has(prop)
    ? (value: string, locale: string) =>
        value === "" || Number.isNaN(Number(value))
          ? value
          : formatCapacityMiB(Number(value), locale) || value
    : undefined,
  render: (row: QuotaRow, locale: string) => {
    const value = row[prop];
    if (prop === "app")
      return (
        <CrossLink kind="app" id={row.app}>
          {row.app}
        </CrossLink>
      );
    if (prop === "quota_used")
      return (
        <span className="inline-flex items-center gap-2">
          {/* A fixed width, right-aligned: the bars start at the same place. */}
          <span className="inline-block w-[4.5rem] shrink-0 text-right">
            {formatCapacityMiB(row.quota_used, locale) || "0"}
          </span>
          <QuotaUsage used={row.quota_used} quota={row.quota} locale={locale} />
        </span>
      );
    // A disk group with more reserved than its size has a reservable space below zero.
    if (prop === "dg_reservable" && typeof value === "number" && value < 0)
      return (
        <span className="text-state-down">
          <span aria-hidden="true">■ </span>−{formatCapacityMiB(-value, locale)}
        </span>
      );
    if (SIZE_PROPS.has(prop) && typeof value === "number")
      return formatCapacityMiB(value, locale) || "0";
    return value;
  },
}));

const ALL_PROPS = COLUMNS.map((column) => column.prop);

/**
 * The quotas of the application codes in the disk groups of the storage arrays,
 * the historical "Disks quotas" view: each with its use by the application's
 * disks, and the space the disk group can still reserve. A StorageManager adds
 * them, changes and deletes them from their panel.
 */
export function QuotasPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("quotas");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/quotas" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/quotas" });
  const shown = visibleProps(search.cols, DEFAULT_COLS, ALL_PROPS);
  const { data, isPending, isError, error, isFetching } = useQuotas(search, shown);
  const canManage = useCanManageQuotas();
  const [creating, setCreating] = useState(false);

  function update(next: Partial<ResolvedListSearch>) {
    // Choosing a row ends a creation in progress: the two drawers share the edge.
    if (next.sel !== undefined) setCreating(false);
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
          <ObjectIcon kind="disk" className="h-5 w-5" />
          {t("quotas.title")}
        </h1>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              update({ sel: undefined });
              setCreating(true);
            }}
            className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
          >
            {t("quotas.create.open")}
          </button>
        )}
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">{t("quotas.intro")}</p>

      <CollectorList
        viewPrefs={prefs}
        valueStats={quotaStats}
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
        exportPage={(page) => fetchQuotas({ ...search, ...page }, shown)}
        total={data?.total}
        filterable
      />

      <QuotaDetailPanel
        quotaId={creating ? undefined : search.sel}
        canManage={canManage}
        onClose={() => {
          update({ sel: undefined });
        }}
      />

      <CreateQuotaPanel
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onCreated={(id) => {
          update({ sel: String(id) });
        }}
      />
    </section>
  );
}
