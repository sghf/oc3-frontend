import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailPanel, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { FlagSwitch } from "@/components/opensvc/FlagSwitch";
import { problemText } from "@/lib/api/problem";
import { formatDateTime } from "@/lib/format";

type SwitchPortRow = components["schemas"]["SwitchPortRow"];

const text = (prop: keyof SwitchPortRow) => (row: SwitchPortRow) => {
  const value = row[prop];
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

const field = (prop: keyof SwitchPortRow) => ({ prop, format: text(prop) });

/** A WWN or an IQN, compared character by character: monospaced, as in the list. */
const address = (prop: keyof SwitchPortRow) => ({
  ...field(prop),
  render: (row: SwitchPortRow) => <code>{text(prop)(row)}</code>,
});

/**
 * Detail of a switch port, read-only as the inventory is: where the port is, its
 * state, then what is plugged on its other end.
 */
const GROUPS: DetailGroup<SwitchPortRow>[] = [
  {
    key: "switch",
    family: "network",
    fields: [
      field("sw_name"),
      address("sw_fabric"),
      field("sw_slot"),
      field("sw_port"),
      field("sw_index"),
    ],
  },
  {
    key: "port",
    family: "network",
    fields: [
      address("sw_portname"),
      field("sw_porttype"),
      field("sw_portstate"),
      field("sw_portspeed"),
      {
        ...field("sw_portnego"),
        // An unused port reports no negotiation at all: neither yes nor no.
        render: (row) =>
          row.sw_portnego === "T" || row.sw_portnego === "F" ? (
            <FlagSwitch value={row.sw_portnego} labelKey="switches.fields.sw_portnego" />
          ) : null,
      },
    ],
  },
  {
    key: "remote",
    family: "node",
    fields: [
      address("sw_rportname"),
      // A node when the collector knows the HBA of the remote port; an array or
      // another switch has no record to open and stays plain text.
      {
        ...field("sw_rname"),
        render: (row) =>
          row.node_id === undefined || row.node_id === "" ? (
            row.sw_rname
          ) : (
            <CrossLink kind="node" id={row.node_id}>
              {row.sw_rname}
            </CrossLink>
          ),
      },
      field("node_id"),
    ],
  },
  {
    key: "record",
    family: "time",
    fields: [{ prop: "sw_updated", format: (row) => formatDateTime(row.sw_updated) }, field("id")],
  },
];

const PROPS = [
  "id",
  "sw_fabric",
  "sw_name",
  "sw_index",
  "sw_slot",
  "sw_port",
  "sw_portspeed",
  "sw_portnego",
  "sw_porttype",
  "sw_portstate",
  "sw_portname",
  "sw_rportname",
  "sw_rname",
  "sw_updated",
  "node_id",
].join(",");

/** A port of a SAN switch, from its row in the list. */
export function SwitchPortDetailPanel({
  portId,
  label,
  onClose,
}: {
  portId: string | undefined;
  /** What the row says of the port, shown while the panel reads it. */
  label: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const {
    data: port,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["switch-port", portId],
    enabled: portId !== undefined,
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/san-switches/{port_id}", {
        params: { path: { port_id: Number(portId) }, query: { props: PROPS } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: SwitchPortRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  return (
    <DetailPanel
      kind="switch"
      open={portId !== undefined}
      title={
        port?.sw_name !== undefined
          ? portLabel(port)
          : label === ""
            ? t("switches.detail.title")
            : label
      }
      onClose={onClose}
      groups={GROUPS}
      row={port}
      labelPrefix="switches.fields"
      groupPrefix="switches.detail.groups"
      isPending={isPending}
      errorMessage={isError ? error.message : null}
    />
  );
}

/** The switch and the slot/port of a port, as its panel names it. */
function portLabel(row: SwitchPortRow): string {
  const where = [row.sw_slot, row.sw_port].filter((v) => v !== undefined && v !== null).join("/");
  return [row.sw_name, where].filter((v) => v !== undefined && v !== "").join(" · ");
}
