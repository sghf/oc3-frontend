import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { DetailContent, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { RelatedTabsPanel } from "@/components/opensvc/RelatedTabsPanel";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/lib/format";
import { FiltersetComposition } from "./FiltersetComposition";
import { FILTERSET_KEY, useFilterset, useFiltersetUsage } from "./filterset-api";
import { FILTERSET_RELATED_TABS } from "./related/filterset-related";

type FiltersetRow = components["schemas"]["FiltersetRow"];

const text = (prop: keyof FiltersetRow) => (row: FiltersetRow) => {
  const value = row[prop];
  return value === undefined ? undefined : String(value);
};

/** The name and the statistics type can be edited; the rest is kept by the collector. */
const GROUPS: DetailGroup<FiltersetRow>[] = [
  {
    key: "properties",
    family: "state",
    fields: [
      { prop: "fset_name", format: text("fset_name"), editable: true },
      { prop: "fset_stats", format: text("fset_stats"), editable: true, input: "boolean" },
      { prop: "fset_author", format: text("fset_author") },
      { prop: "fset_updated", format: (row, locale) => formatDateTime(row.fset_updated, locale) },
      { prop: "id", format: text("id") },
    ],
  },
];

/**
 * Detail of a filterset: properties, composition and uses, then the nodes and the
 * services it selects, a tab each. The open tab lives in the URL (`tab`), held by
 * the view.
 *
 * The first tab is built here rather than through `DetailPanel`: the composition and
 * the uses are not lists of properties.
 */
export function FiltersetDetailPanel({
  filtersetId,
  label,
  onClose,
  tab,
  onTabChange,
}: {
  filtersetId: string | undefined;
  label: string;
  onClose: () => void;
  tab: string | undefined;
  onTabChange: (tab: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const filterset = useFilterset(filtersetId);
  const usage = useFiltersetUsage(filtersetId);
  const row = filterset.data;
  const open = filtersetId !== undefined;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["filtersets"] });
    await queryClient.invalidateQueries({ queryKey: [FILTERSET_KEY] });
  }

  const save = useMutation({
    mutationFn: async (changes: Record<string, string | number | boolean>) => {
      const body: { fset_name?: string; fset_stats?: "T" | "F" } = {};
      if (typeof changes.fset_name === "string") body.fset_name = changes.fset_name;
      // The collector stores the statistical type as "T" / "F", the switch as a boolean.
      if (typeof changes.fset_stats === "boolean") body.fset_stats = changes.fset_stats ? "T" : "F";
      const { error } = await api.POST("/filtersets/{filterset_id}", {
        params: { path: { filterset_id: filtersetId ?? "" } },
        body,
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE("/filtersets/{filterset_id}", {
        params: { path: { filterset_id: filtersetId ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });

  const used = usage.data;
  const usedCount =
    used === undefined ? 0 : used.filtersets.length + used.rulesets.length + used.thresholds.length;
  const name = row?.fset_name ?? "";

  return (
    <RelatedTabsPanel
      open={open}
      title={row?.fset_name ?? (label === "" ? t("filtersets.detail.title") : label)}
      kind="filterset"
      onClose={onClose}
      objectId={filtersetId}
      tabs={FILTERSET_RELATED_TABS}
      tab={tab}
      onTabChange={onTabChange}
      propertiesFamily="state"
      label={t("filtersets.related.label")}
    >
      <div className="flex flex-col gap-5">
        <DetailContent
          groups={GROUPS}
          row={row}
          labelPrefix="filtersets.fields"
          groupPrefix="filtersets.detail.groups"
          isPending={open && filterset.isPending}
          errorMessage={filterset.isError ? filterset.error.message : null}
          onSave={(changes) => save.mutateAsync(changes)}
          editHint={t("filtersets.detail.editHint")}
        />

        {row !== null && row !== undefined && filtersetId !== undefined && (
          <>
            <FiltersetComposition filtersetId={filtersetId} filtersetName={name} />

            <section>
              <h3 className="mb-1 flex items-center gap-2 font-semibold text-ink-muted">
                <ObjectIcon kind="filterset" />
                {t("filtersets.usage.title")}
              </h3>
              {used !== undefined && usedCount === 0 && (
                <p className="text-ink-muted">{t("filtersets.usage.none")}</p>
              )}
              {used !== undefined && usedCount > 0 && (
                <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] items-center gap-x-3 gap-y-1.5 text-data">
                  {used.filtersets.length > 0 && (
                    <>
                      <dt className="text-ink-muted">{t("filtersets.usage.filtersets")}</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {used.filtersets.map((ref) => (
                          <CrossLink key={ref.id} kind="filterset" id={String(ref.id)}>
                            {ref.fset_name}
                          </CrossLink>
                        ))}
                      </dd>
                    </>
                  )}
                  {used.rulesets.length > 0 && (
                    <>
                      <dt className="text-ink-muted">{t("filtersets.usage.rulesets")}</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {used.rulesets.map((ref) => (
                          <CrossLink key={ref.id} kind="ruleset" id={String(ref.id)}>
                            {ref.ruleset_name}
                          </CrossLink>
                        ))}
                      </dd>
                    </>
                  )}
                  {used.thresholds.length > 0 && (
                    <>
                      <dt className="text-ink-muted">{t("filtersets.usage.thresholds")}</dt>
                      <dd>{used.thresholds.join(", ")}</dd>
                    </>
                  )}
                </dl>
              )}
            </section>

            <div className="border-t border-line pt-3">
              <ConfirmButton
                icon={<TrashIcon />}
                label={t("detail.delete")}
                question={
                  usedCount > 0
                    ? t("filtersets.delete.questionUsed", { name, count: usedCount })
                    : t("filtersets.delete.question", { name })
                }
                confirmLabel={t("detail.deleteConfirm")}
                cancelLabel={t("detail.cancel")}
                pendingLabel={t("detail.deleting")}
                pending={remove.isPending}
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
          </>
        )}
      </div>
    </RelatedTabsPanel>
  );
}
