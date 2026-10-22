import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { formatDateTime, formatSizeMiB } from "@/lib/format";

type DiskRow = components["schemas"]["DiskRow"];

const text = (prop: keyof DiskRow) => (row: DiskRow) => {
  const value = row[prop];
  return value === undefined ? undefined : String(value);
};

const field = (
  prop: keyof DiskRow,
  format?: (row: DiskRow, locale: string) => string | undefined,
) => ({ prop, format: format ?? text(prop) });

const GROUPS: DetailGroup<DiskRow>[] = [
  {
    key: "disk",
    family: "disk",
    fields: [
      field("disk_id"),
      field("disk_name"),
      field("disk_devid"),
      field("disk_vendor"),
      field("disk_model"),
      field("updated", (row) => formatDateTime(row.updated)),
    ],
  },
  {
    key: "capacity",
    family: "memory",
    fields: [
      field("disk_size", (row, locale) => formatSizeMiB(row.disk_size, locale)),
      field("disk_used", (row, locale) => formatSizeMiB(row.disk_used, locale)),
      field("disk_alloc", (row, locale) => formatSizeMiB(row.disk_alloc, locale)),
      field("disk_raid"),
      field("disk_level"),
      field("disk_group"),
    ],
  },
  {
    key: "attachment",
    family: "node",
    fields: [
      linkedField<DiskRow>("nodename", "node", (row) => row.node_id, text("nodename")),
      field("node_id"),
      linkedField<DiskRow>("svcname", "service", (row) => row.svc_id, text("svcname")),
      field("svc_id"),
      linkedField<DiskRow>("app", "app", (row) => row.app, text("app")),
      field("disk_arrayid"),
      field("disk_dg"),
      field("disk_region"),
    ],
  },
];

const PROPS = GROUPS.flatMap((group) => group.fields.map((f) => f.prop)).join(",");

export function DiskDetailPanel({
  diskId,
  label,
  onClose,
}: {
  diskId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    data: disk,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["disk", diskId],
    enabled: diskId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/disks/{disk_id}", {
        params: { path: { disk_id: diskId ?? "" }, query: { props: PROPS } },
      });
      if (failure !== undefined) throw new Error(JSON.stringify(failure));
      const rows: DiskRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  return (
    <DetailPanel
      kind="disk"
      recordId={diskId}
      open={diskId !== undefined}
      title={disk?.disk_id ?? (label === "" ? t("disks.detail.title") : label)}
      onClose={onClose}
      groups={GROUPS}
      row={disk}
      labelPrefix="disks.fields"
      groupPrefix="disks.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
    />
  );
}
