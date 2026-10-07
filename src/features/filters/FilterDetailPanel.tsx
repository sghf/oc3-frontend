import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { FilterUsageList, UsageWarning } from "@/components/opensvc/FiltersetUsage";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";
import { problemText } from "@/lib/api/problem";
import { formatDateTime } from "@/lib/format";
import { useFilter, useFilterUsage } from "./use-filter";

type FilterRow = components["schemas"]["FilterRow"];

const text = (prop: keyof FilterRow) => (row: FilterRow) => {
  const value = row[prop];
  return value === undefined || value === null ? undefined : String(value);
};

const GROUPS: DetailGroup<FilterRow>[] = [
  {
    key: "definition",
    family: "state",
    fields: [
      { prop: "f_label", format: text("f_label") },
      { prop: "f_table", format: text("f_table") },
      { prop: "f_field", format: text("f_field") },
      { prop: "f_op", format: text("f_op") },
      { prop: "f_value", format: text("f_value") },
    ],
  },
  {
    key: "record",
    family: "time",
    fields: [
      { prop: "f_author", format: text("f_author") },
      { prop: "f_updated", format: (row, locale) => formatDateTime(row.f_updated, locale) },
      { prop: "id", format: text("id") },
      { prop: "f_cksum", format: text("f_cksum") },
    ],
  },
];

export function FilterDetailPanel({
  filterId,
  label,
  onClose,
  onEdit,
}: {
  filterId: string | undefined;
  label: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: filter, isPending, isError, error } = useFilter(filterId);
  const usage = useFilterUsage(filterId);
  const usedBy = usage.data ?? [];

  // The collector also detaches the filter from the filtersets that use it.
  const remove = useMutation({
    mutationFn: async () => {
      const { error: failure } = await api.DELETE("/filters/{filter_id}", {
        params: { path: { filter_id: filterId ?? "" } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["filters"] });
      await queryClient.invalidateQueries({ queryKey: ["filterset"] });
      await queryClient.invalidateQueries({ queryKey: ["filtersets"] });
      onClose();
    },
  });

  return (
    <DetailPanel
      kind="filter"
      open={filterId !== undefined}
      title={filter?.f_label ?? (label === "" ? t("filters.detail.title") : label)}
      onClose={onClose}
      groups={GROUPS}
      row={filter}
      labelPrefix="filters.fields"
      groupPrefix="filters.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      actions={
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-8 items-center gap-1.5 rounded-(--radius-control) border border-line px-3 text-ink hover:bg-surface-sunken"
          >
            <PencilIcon />
            {t("filters.form.edit")}
          </button>
          <div>
            <ConfirmButton
              icon={<TrashIcon />}
              label={t("detail.delete")}
              question={t("filters.delete.question", { label: filter?.f_label ?? "" })}
              confirmLabel={t("detail.deleteConfirm")}
              cancelLabel={t("detail.cancel")}
              pendingLabel={t("detail.deleting")}
              pending={remove.isPending}
              // The uses are read again on arming: the panel may have been open a while.
              onArm={() => {
                void usage.refetch();
              }}
              blocked={usage.isFetching}
              details={
                usage.isFetching ? (
                  <p className="text-ink-muted">{t("usage.checking")}</p>
                ) : usage.isError ? (
                  <p role="alert" className="text-state-down">
                    ■ {t("usage.error", { message: usage.error.message })}
                  </p>
                ) : usedBy.length > 0 ? (
                  <UsageWarning title={t("usage.filter.warning", { count: usedBy.length })}>
                    <FilterUsageList filtersets={usedBy} consequences />
                  </UsageWarning>
                ) : undefined
              }
              acknowledge={
                usage.isError
                  ? t("usage.acknowledgeUnknown")
                  : usedBy.length > 0
                    ? t("usage.filter.acknowledge", { count: usedBy.length })
                    : undefined
              }
              onConfirm={() => {
                remove.mutate();
              }}
            />
            {remove.isError && (
              <p role="alert" className="mt-2 text-state-down">
                ■ {remove.error.message}
              </p>
            )}
          </div>
        </div>
      }
    />
  );
}
