import type { components } from "@/lib/api/schema";

type AlertRow = components["schemas"]["AlertRow"];

/** Name of the object aimed at: an entry carries either a service or a node. */
export function objectName(row: AlertRow): string {
  return row["services.svcname"] ?? row["nodes.nodename"] ?? "";
}

/**
 * How an alert is named in the confirmations and reports: its type and the object
 * it aims at, the alerts having no name of their own.
 */
export function alertName(row: AlertRow): string {
  const object = objectName(row);
  const type = row.dash_type ?? "";
  return object === "" ? type : `${object}: ${type}`;
}
