import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { formatDateTime, formatSizeBytes } from "@/lib/format";
import type { SaveRow } from "./use-saves";

const text = (prop: keyof SaveRow) => (row: SaveRow) => {
  const value = row[prop];
  return value === undefined || value === "" ? undefined : String(value);
};

const field = (
  prop: keyof SaveRow,
  format?: (row: SaveRow, locale: string) => string | undefined,
) => ({ prop, format: format ?? text(prop) });

/** What was saved and when, where it is kept, and whose it is. */
const GROUPS: DetailGroup<SaveRow>[] = [
  {
    key: "backup",
    family: "disk",
    fields: [
      field("save_name"),
      field("save_level"),
      field("save_size", (row, locale) => formatSizeBytes(row.save_size, locale)),
      field("save_date", (row) => formatDateTime(row.save_date)),
      field("save_retention", (row) => formatDateTime(row.save_retention)),
    ],
  },
  {
    key: "location",
    family: "disk",
    fields: [
      field("save_server"),
      field("save_group"),
      field("save_volume"),
      field("save_id"),
      field("id"),
    ],
  },
  {
    key: "owner",
    family: "node",
    fields: [
      linkedField<SaveRow>("save_app", "app", (row) => row.save_app, text("save_app")),
      linkedField<SaveRow>("nodename", "node", (row) => row.node_id, text("nodename")),
      field("node_id"),
      linkedField<SaveRow>("svcname", "service", (row) => row.svc_id, text("svcname")),
      field("svc_id"),
    ],
  },
];

const PROPS = GROUPS.flatMap((group) => group.fields.map((f) => f.prop)).join(",");

/** A backup, as the Saves view lists it, opened from its row. */
export function SaveDetailPanel({
  saveId,
  label,
  onClose,
}: {
  saveId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useQuery({
    queryKey: ["saves", "one", saveId],
    enabled: saveId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/saves/{save_id}", {
        params: { path: { save_id: Number(saveId) }, query: { props: PROPS } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: SaveRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });
  const row = save.data ?? undefined;
  return (
    <DetailPanel
      kind="save"
      recordId={saveId}
      open={saveId !== undefined}
      title={row?.save_name ?? (label === "" ? t("saves.detail.title") : label)}
      onClose={onClose}
      groups={GROUPS}
      row={row}
      labelPrefix="saves.fields"
      groupPrefix="saves.detail.groups"
      isPending={save.isPending}
      errorMessage={save.isError ? save.error.message : null}
    />
  );
}
