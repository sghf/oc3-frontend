import { Link } from "@tanstack/react-router";
import type { components } from "@/lib/api/schema";
import type { DetailGroup } from "@/components/opensvc/DetailPanel";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { formatDateTime } from "@/lib/format";
import { ClusterNodes } from "./ClusterNodes";

type ClusterRow = components["schemas"]["ClusterRow"];

const text = (prop: keyof ClusterRow) => (row: ClusterRow) => {
  const value = row[prop];
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

const field = (prop: keyof ClusterRow) => ({ prop, format: text(prop) });

/** A daemon flag, 1 or 0, shown as the switches of the other records. */
const flag = (prop: keyof ClusterRow) => ({ ...field(prop), input: "boolean" as const });

/**
 * A count of the collector's objects naming the cluster, as a link to their list
 * filtered on it.
 */
const count = (prop: "node_count" | "svc_count", to: "/nodes" | "/services") => ({
  ...field(prop),
  render: (row: ClusterRow) => (
    <Link
      to={to}
      search={{ "f.cluster_id": row.cluster_id ?? "" }}
      className="underline decoration-line underline-offset-2"
    >
      {row[prop]}
    </Link>
  ),
});

/** A cluster, read-only: its daemon is what describes it. */
export const CLUSTER_GROUPS: DetailGroup<ClusterRow>[] = [
  {
    key: "identity",
    family: "cluster",
    fields: [field("cluster_name"), field("cluster_id"), field("id")],
  },
  {
    key: "members",
    family: "node",
    fields: [
      count("node_count", "/nodes"),
      count("svc_count", "/services"),
      {
        ...field("cluster_nodes"),
        render: (row: ClusterRow) => (
          <ClusterNodes clusterId={row.cluster_id} names={row.cluster_nodes} />
        ),
      },
      field("agent_versions"),
    ],
  },
  {
    key: "state",
    family: "state",
    fields: [
      flag("frozen"),
      flag("quorum"),
      flag("compat"),
      field("listener_port"),
      {
        prop: "cluster_updated",
        format: (row: ClusterRow) =>
          row.cluster_updated === undefined || row.cluster_updated === ""
            ? undefined
            : formatDateTime(row.cluster_updated),
        // The age first: whether the cluster still reports is what it says.
        render: (row: ClusterRow, locale: string) => (
          <RelativeTime value={row.cluster_updated} locale={locale} />
        ),
      },
    ],
  },
];
