import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { problemText } from "@/lib/api/problem";
import { formatDate, formatDateTime } from "@/lib/format";

type ObsolescenceSettingRow = components["schemas"]["ObsolescenceSettingRow"];

const text = (prop: keyof ObsolescenceSettingRow) => (row: ObsolescenceSettingRow) => {
  const value = row[prop];
  return value === undefined ? undefined : String(value);
};

/**
 * Only the two deadlines can be edited: the type and the name say what the setting
 * aims at, and apicollector does not accept them for writing. Clearing a deadline
 * removes it.
 */
function groups(t: (key: string) => string): DetailGroup<ObsolescenceSettingRow>[] {
  return [
    {
      key: "target",
      family: "node",
      fields: [
        {
          prop: "obs_type",
          format: (row) =>
            row.obs_type === undefined ? undefined : t(`obsolescence.type.${row.obs_type}`),
        },
        { prop: "obs_name", format: text("obs_name") },
        { prop: "obs_count", format: text("obs_count") },
        { prop: "id", format: text("id") },
      ],
    },
    {
      key: "deadlines",
      family: "alert",
      fields: [
        {
          prop: "obs_warn_date",
          format: (row) => formatDate(row.obs_warn_date),
          editable: true,
          input: "date",
        },
        { prop: "obs_warn_date_updated_by", format: text("obs_warn_date_updated_by") },
        {
          prop: "obs_warn_date_updated",
          format: (row) => formatDateTime(row.obs_warn_date_updated),
        },
        {
          prop: "obs_alert_date",
          format: (row) => formatDate(row.obs_alert_date),
          editable: true,
          input: "date",
        },
        { prop: "obs_alert_date_updated_by", format: text("obs_alert_date_updated_by") },
        {
          prop: "obs_alert_date_updated",
          format: (row) => formatDateTime(row.obs_alert_date_updated),
        },
      ],
    },
  ];
}

/** Body of the update: the two deadlines only, and only as strings. */
function toBody(changes: Record<string, string | number | boolean>) {
  const body: { obs_warn_date?: string; obs_alert_date?: string } = {};
  if (typeof changes.obs_warn_date === "string") body.obs_warn_date = changes.obs_warn_date;
  if (typeof changes.obs_alert_date === "string") body.obs_alert_date = changes.obs_alert_date;
  return body;
}

export function ObsolescenceDetailPanel({
  settingId,
  label,
  onClose,
}: {
  settingId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    data: setting,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["obsolescence-setting", settingId],
    enabled: settingId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/obsolescence/settings/{id}", {
        params: { path: { id: settingId ?? "" } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: ObsolescenceSettingRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  // On the collector side, the update also carries the dates over to the nodes aimed
  // at and recomputes their obsolescence alerts on the dashboard.
  const save = useMutation({
    mutationFn: async (changes: Record<string, string | number | boolean>) => {
      const { error: failure } = await api.POST("/obsolescence/settings/{id}", {
        params: { path: { id: settingId ?? "" } },
        body: toBody(changes),
      });
      if (failure !== undefined) throw new Error(problemText(failure));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["obsolescence"] });
      await queryClient.invalidateQueries({ queryKey: ["obsolescence-setting", settingId] });
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  return (
    <DetailPanel
      kind="obsolescence"
      open={settingId !== undefined}
      title={setting?.obs_name ?? (label === "" ? t("obsolescence.detail.title") : label)}
      onClose={onClose}
      groups={groups(t)}
      row={setting}
      onSave={(changes) => save.mutateAsync(changes)}
      editHint={t("obsolescence.detail.editHint")}
      labelPrefix="obsolescence.fields"
      groupPrefix="obsolescence.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
    />
  );
}
