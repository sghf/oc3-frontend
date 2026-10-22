import type { components } from "@/lib/api/schema";
import type { DetailGroup } from "@/components/opensvc/DetailPanel";
import { linkedField } from "@/components/opensvc/linked-field";
import { statusField } from "@/components/opensvc/status-field";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { formatDateTime } from "@/lib/format";

type ResourceRow = components["schemas"]["ResourceRow"];

const text = (prop: keyof ResourceRow) => (row: ResourceRow) => {
  const value = row[prop];
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

const field = (prop: keyof ResourceRow) => ({ prop, format: text(prop) });

/** A T / F flag of the agent, as the switches of the other records. */
const flag = (prop: keyof ResourceRow) => ({ ...field(prop), input: "boolean" as const });

const date = (prop: "changed" | "updated", relative: boolean) => ({
  prop,
  format: (row: ResourceRow) =>
    row[prop] === undefined || row[prop] === "" ? undefined : formatDateTime(row[prop]),
  render: relative
    ? (row: ResourceRow, locale: string) => <RelativeTime value={row[prop]} locale={locale} />
    : undefined,
});

/** A resource, read-only: its agent is what describes it. */
export const RESOURCE_GROUPS: DetailGroup<ResourceRow>[] = [
  {
    key: "identity",
    family: "resource",
    fields: [
      linkedField<ResourceRow>(
        "services.svcname",
        "service",
        (row) => row.svc_id,
        text("services.svcname"),
      ),
      linkedField<ResourceRow>(
        "nodes.nodename",
        "node",
        (row) => row.node_id,
        text("nodes.nodename"),
      ),
      field("vmname"),
      field("rid"),
      field("res_type"),
      field("res_desc"),
    ],
  },
  {
    key: "state",
    family: "state",
    fields: [
      statusField<ResourceRow>("res_status", (row) => row.res_status),
      flag("res_monitor"),
      flag("res_disable"),
      flag("res_optional"),
      {
        ...field("res_log"),
        // The agent's log, line breaks kept.
        render: (row: ResourceRow) => (
          <pre className="max-h-64 overflow-auto rounded-(--radius-control) bg-surface-sunken p-2 font-mono text-data whitespace-pre-wrap">
            {row.res_log}
          </pre>
        ),
      },
      date("updated", true),
      date("changed", false),
    ],
  },
  {
    key: "record",
    family: "time",
    fields: [field("id"), field("svc_id"), field("node_id")],
  },
];
