import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { problemText } from "@/lib/api/problem";
import { formatDateTime } from "@/lib/format";

type NodeHardwareRow = components["schemas"]["NodeHardwareRow"];

const text = (prop: keyof NodeHardwareRow) => (row: NodeHardwareRow) => {
  const value = row[prop];
  // The joined node props are null for a component of a node the collector no
  // longer has.
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

const field = (prop: keyof NodeHardwareRow) => ({ prop, format: text(prop) });

/**
 * Detail of a hardware component, read-only as the agents report it: the
 * component, the node it belongs to, then the record. `typeLabel` names the
 * component family the agent reports as a code (`pci`, `mem`…).
 */
function groups(typeLabel: (code: string) => string): DetailGroup<NodeHardwareRow>[] {
  return [
    {
      key: "component",
      family: "cpu",
      fields: [
        {
          prop: "hw_type",
          format: (row) => (row.hw_type === undefined ? undefined : typeLabel(row.hw_type)),
        },
        { ...field("hw_path"), render: (row) => <code>{row.hw_path}</code> },
        field("hw_class"),
        field("hw_description"),
        field("hw_driver"),
      ],
    },
    {
      key: "node",
      family: "node",
      fields: [
        linkedField<NodeHardwareRow>(
          "nodes.nodename",
          "node",
          (row) => row.node_id,
          text("nodes.nodename"),
        ),
        field("node_id"),
        linkedField<NodeHardwareRow>(
          "nodes.app",
          "app",
          (row) => text("nodes.app")(row),
          text("nodes.app"),
        ),
        field("nodes.os_name"),
      ],
    },
    {
      key: "record",
      family: "time",
      fields: [
        // Date of the agent's last asset push.
        { prop: "updated", format: (row) => formatDateTime(row.updated) },
        field("id"),
      ],
    },
  ];
}

const PROPS = [
  "id",
  "node_id",
  "nodes.nodename",
  "nodes.app",
  "nodes.os_name",
  "hw_type",
  "hw_path",
  "hw_class",
  "hw_description",
  "hw_driver",
  "updated",
].join(",");

/** A hardware component of a node, from its row in the list. */
export function HardwareDetailPanel({
  hwId,
  label,
  onClose,
}: {
  hwId: string | undefined;
  /** What the row says of the component, shown while the panel reads it. */
  label: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const {
    data: component,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["hardware-component", hwId],
    enabled: hwId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/nodes/hardware/{hw_id}", {
        params: { path: { hw_id: Number(hwId) }, query: { props: PROPS } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: NodeHardwareRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  const typeLabel = (code: string) =>
    i18n.exists(`nodes.hardware.types.${code}`) ? t(`nodes.hardware.types.${code}`) : code;
  const name = [component?.["nodes.nodename"], component?.hw_path]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" · ");

  return (
    <DetailPanel
      kind="hardware"
      open={hwId !== undefined}
      title={name !== "" ? name : label === "" ? t("hardware.detail.title") : label}
      onClose={onClose}
      groups={groups(typeLabel)}
      row={component}
      labelPrefix="hardware.fields"
      groupPrefix="hardware.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
    />
  );
}
