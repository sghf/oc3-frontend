import type { DetailGroup } from "@/components/opensvc/DetailPanel";
import { ActionStatus, ScheduledMark } from "@/components/opensvc/AgentActionParts";
import { actionTargets, type AgentAction } from "@/components/opensvc/agent-action";
import { linkedField } from "@/components/opensvc/linked-field";
import { formatDateTime, formatDuration } from "@/lib/format";

const text = (prop: keyof AgentAction) => (row: AgentAction) => {
  const value = row[prop];
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

const field = (prop: keyof AgentAction) => ({ prop, format: text(prop) });

const date = (prop: "begin" | "end" | "acked_date") => ({
  prop,
  format: (row: AgentAction, locale: string) => {
    const value = row[prop];
    return value === undefined || value === null || value === ""
      ? undefined
      : formatDateTime(value, locale);
  },
});

/** An action an agent ran, read-only: the agent is what describes it. */
export const ACTION_GROUPS: DetailGroup<AgentAction>[] = [
  {
    key: "identity",
    family: "service",
    fields: [
      linkedField<AgentAction>(
        "services.svcname",
        "service",
        (row) => row.svc_id,
        text("services.svcname"),
      ),
      linkedField<AgentAction>(
        "nodes.nodename",
        "node",
        (row) => row.node_id ?? undefined,
        text("nodes.nodename"),
      ),
      field("action"),
      {
        prop: "rid",
        // Every resource here, one after the other: the list abbreviates them.
        format: (row) => {
          const parts = actionTargets(row.subset, row.rid);
          return parts.length === 0 ? undefined : parts.join(", ");
        },
      },
      {
        prop: "command",
        format: text("command"),
        render: (row) => <code className="text-data">{row.command}</code>,
      },
      field("origin"),
    ],
  },
  {
    key: "run",
    family: "state",
    fields: [
      {
        prop: "status",
        // Always shown: an empty status is an action still running.
        format: (row) => row.status ?? "",
        render: (row) => <ActionStatus status={row.status} />,
      },
      date("begin"),
      date("end"),
      {
        prop: "time",
        format: (row, locale) =>
          row.time === null || row.time === undefined
            ? undefined
            : formatDuration(row.time, locale),
      },
      {
        prop: "cron",
        format: (row) => (row.cron === 1 ? "1" : undefined),
        render: (row) => (
          <span className="flex items-center gap-1.5">
            <ScheduledMark cron={row.cron} />
          </span>
        ),
      },
      field("sid"),
      field("pid"),
      field("version"),
    ],
  },
  {
    key: "ack",
    family: "alert",
    fields: [field("acked_by"), date("acked_date"), field("acked_comment")],
  },
];
