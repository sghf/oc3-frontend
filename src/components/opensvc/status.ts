import type { ObjectState } from "./StatusBadge";

/**
 * Translates a collector status into an OpenSVC object state.
 * The database stores "up", "warn", "down", "n/a", and an empty string for a service
 * that has never reported a status: the last two are an unknown state.
 */
export function toObjectState(value: string | undefined): ObjectState {
  switch (value) {
    case "up":
    case "warn":
    case "down":
      return value;
    default:
      return "unknown";
  }
}

/**
 * Badge for a collector status, standby values included. As in the historical
 * collector (`cell_decorator_status`), "stdby up" takes the colour of "up" and
 * "stdby down" that of "down", and "undef" that of an unknown state; those values
 * keep their own label, which says more than the state alone.
 */
export function statusBadge(value: string | undefined): { state: ObjectState; label?: string } {
  switch (value) {
    case "stdby up":
      return { state: "up", label: value };
    case "stdby down":
      return { state: "down", label: value };
    case "undef":
      return { state: "unknown", label: value };
    default:
      return { state: toObjectState(value) };
  }
}

/** The values `statusBadge` knows, an unknown state's included. */
const STATUS_VALUES = new Set(["up", "warn", "down", "n/a", "stdby up", "stdby down", "undef"]);

/**
 * Whether a value is a collector status, to show as a badge. A field the collector
 * also lets one fill by hand, such as the status of a node's asset, may hold free
 * text: shown as a badge, it would read as an unknown state and lose its words.
 */
export function isStatusValue(value: unknown): value is string {
  return typeof value === "string" && STATUS_VALUES.has(value);
}
