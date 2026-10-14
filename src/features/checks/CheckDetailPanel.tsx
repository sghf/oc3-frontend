import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { CheckState, CheckThresholds } from "@/components/opensvc/CheckState";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { formatDateTime } from "@/lib/format";
import { CheckActionsMenu } from "./CheckActionsMenu";

type CheckRow = components["schemas"]["CheckRow"];

const text = (prop: keyof CheckRow) => (row: CheckRow) => {
  const value = row[prop];
  return value === undefined || value === null ? undefined : String(value);
};

const field = (
  prop: keyof CheckRow,
  format?: (row: CheckRow, locale: string) => string | undefined,
) => ({ prop, format: format ?? text(prop) });

const GROUPS: DetailGroup<CheckRow>[] = [
  {
    key: "check",
    family: "state",
    fields: [
      field("chk_type"),
      field("chk_instance"),
      field("chk_value"),
      {
        prop: "chk_err",
        format: text("chk_err"),
        render: (row) => <CheckState err={row.chk_err} />,
      },
      field("chk_updated", (row, locale) => formatDateTime(row.chk_updated, locale)),
      field("chk_created", (row, locale) => formatDateTime(row.chk_created, locale)),
    ],
  },
  {
    key: "thresholds",
    family: "alert",
    fields: [
      {
        prop: "thresholds",
        format: (row) =>
          row.chk_low === null && row.chk_high === null
            ? undefined
            : `${String(row.chk_low)} – ${String(row.chk_high)}`,
        render: (row) => <CheckThresholds low={row.chk_low} high={row.chk_high} />,
      },
      field("chk_threshold_provider"),
    ],
  },
  {
    key: "object",
    family: "node",
    fields: [
      linkedField<CheckRow>("nodes.nodename", "node", (row) => row.node_id, text("nodes.nodename")),
      field("node_id"),
      linkedField<CheckRow>(
        "services.svcname",
        "service",
        (row) => (row.svc_id === "" ? undefined : row.svc_id),
        text("services.svcname"),
      ),
      field("svc_id"),
      field("id"),
    ],
  },
];

const PROPS = [
  "id",
  "node_id",
  "nodes.nodename",
  "svc_id",
  "services.svcname",
  "chk_type",
  "chk_instance",
  "chk_value",
  "chk_low",
  "chk_high",
  "chk_err",
  "chk_threshold_provider",
  "chk_created",
  "chk_updated",
].join(",");

/**
 * A check, as its agent reports it and with the thresholds the collector sets
 * it, and the actions on it in the header: its thresholds, set or reset, and
 * its deletion, which closes the panel.
 */
export function CheckDetailPanel({
  checkId,
  label,
  onClose,
}: {
  checkId: string | undefined;
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    data: check,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["check", checkId],
    enabled: checkId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/checks/live", {
        params: { query: { props: PROPS, filter: [`id:${checkId ?? ""}`], limit: 1 } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: CheckRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  const keys = new Map<string, components["schemas"]["CheckKey"]>();
  if (
    check?.node_id !== undefined &&
    check.chk_type !== undefined &&
    check.chk_instance !== undefined
  )
    keys.set(String(check.id), {
      node_id: check.node_id,
      svc_id: check.svc_id ?? "",
      chk_type: check.chk_type,
      chk_instance: check.chk_instance,
    });
  const title =
    check?.chk_type === undefined
      ? label === ""
        ? t("checks.detail.title")
        : label
      : `${check.chk_type}:${check.chk_instance ?? ""}`;

  return (
    <DetailPanel
      kind="check"
      open={checkId !== undefined}
      title={title}
      onClose={onClose}
      groups={GROUPS}
      row={check}
      labelPrefix="checks.fields"
      groupPrefix="checks.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
      titleActions={
        checkId !== undefined && check !== null && check !== undefined ? (
          <CheckActionsMenu
            checks={[{ id: checkId, name: title }]}
            keys={keys}
            onDeleted={onClose}
          />
        ) : undefined
      }
    />
  );
}
