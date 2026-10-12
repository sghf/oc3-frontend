import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { FlagSwitch } from "@/components/opensvc/FlagSwitch";
import { PencilIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/format";
import { useMetric } from "./use-metric";

type MetricRow = components["schemas"]["MetricRow"];

const text = (prop: keyof MetricRow) => (row: MetricRow) => {
  const value = row[prop];
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

const GROUPS: DetailGroup<MetricRow>[] = [
  {
    key: "definition",
    family: "state",
    fields: [
      { prop: "metric_name", format: text("metric_name") },
      {
        prop: "metric_historize",
        format: text("metric_historize"),
        render: (row) => (
          <FlagSwitch
            value={row.metric_historize}
            labelKey="metrics.fields.metric_historize"
            size="md"
          />
        ),
      },
      {
        prop: "metric_sql",
        format: text("metric_sql"),
        // A request reads best as typed, line breaks and indentation included.
        render: (row) => (
          <pre className="max-h-80 overflow-auto rounded-(--radius-control) bg-surface-sunken p-2 font-mono text-data whitespace-pre-wrap">
            {row.metric_sql}
          </pre>
        ),
      },
    ],
  },
  {
    key: "columns",
    family: "state",
    fields: [
      { prop: "metric_col_value_index", format: text("metric_col_value_index") },
      { prop: "metric_col_instance_index", format: text("metric_col_instance_index") },
      { prop: "metric_col_instance_label", format: text("metric_col_instance_label") },
    ],
  },
  {
    key: "record",
    family: "time",
    fields: [
      { prop: "metric_author", format: text("metric_author") },
      {
        prop: "metric_created",
        format: (row, locale) => formatDateTime(row.metric_created, locale),
      },
      { prop: "id", format: text("id") },
    ],
  },
];

/** A metric, read-only, with the button that opens its edit form. */
export function MetricDetailPanel({
  metricId,
  label,
  onClose,
  onEdit,
}: {
  metricId: string | undefined;
  label: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { data: metric, isPending, isError, error } = useMetric(metricId);

  return (
    <DetailPanel
      kind="metric"
      open={metricId !== undefined}
      recordId={metricId}
      title={metric?.metric_name ?? (label === "" ? t("metrics.detail.title") : label)}
      onClose={onClose}
      groups={GROUPS}
      row={metric}
      labelPrefix="metrics.fields"
      groupPrefix="metrics.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      actions={
        <button
          type="button"
          onClick={onEdit}
          className="flex h-8 items-center gap-1.5 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
        >
          <PencilIcon />
          {t("metrics.form.edit")}
        </button>
      }
    />
  );
}
