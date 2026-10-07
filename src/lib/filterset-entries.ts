import type { components } from "@/lib/api/schema";
import { isInverted, type ColumnFilters } from "@/lib/column-filters";

export type FiltersetNewEntry = components["schemas"]["FiltersetNewEntry"];

/** Tables a filter of a filterset may apply to: those oc3 accepts (`filterTables`). */
const FILTER_TABLES = new Set([
  "nodes",
  "node_ip",
  "services",
  "svcmon",
  "resmon",
  "apps",
  "node_hba",
  "diskinfo",
  "svcdisks",
  "v_comp_moduleset_attachments",
  "v_tags",
  "packages",
]);

/** Size of `gen_filters.f_value`. */
export const FILTER_VALUE_MAX = 256;

/** Size of `gen_filtersets.fset_name`. */
export const FILTERSET_NAME_MAX = 100;

/**
 * How the columns of a list map onto the tables a filterset filters: the table its
 * own props are columns of, and the props that are not (computed, or read from a
 * table filtersets cannot filter). A joined prop, `nodes.nodename`, names its table.
 */
export interface FiltersetSource {
  table: string;
  exclude?: readonly string[];
  /** What the filterset selects from these rows, for the explanation shown. */
  selects: "nodes" | "services" | "related";
}

/** Why a column filter has no filterset equivalent. */
export type UnstorableReason = "regex" | "empty" | "column" | "length";

export type TranslatedFilter =
  | { prop: string; expr: string; entry: FiltersetNewEntry }
  | { prop: string; expr: string; reason: UnstorableReason };

/** The LIKE wildcards of a text, protected as the API protects them for a list filter. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const COMPARISONS: [string, FiltersetNewEntry["f_op"]][] = [
  ["gte:", ">="],
  ["lte:", "<="],
  ["gt:", ">"],
  ["lt:", "<"],
  ["eq:", "="],
];

/** The table and column of a prop, when filtersets can filter on it. */
function columnOf(prop: string, source: FiltersetSource) {
  const dot = prop.indexOf(".");
  if (dot > 0) {
    const table = prop.slice(0, dot);
    return FILTER_TABLES.has(table) ? { table, field: prop.slice(dot + 1) } : undefined;
  }
  if (source.exclude?.includes(prop) === true) return undefined;
  return { table: source.table, field: prop };
}

/**
 * One column filter of a list as an entry of a filterset, selecting the same rows,
 * or the reason it cannot be one. The operators follow the list filters of the API
 * (`server/handlers/list_filters.go` in oc3): a text is a substring, its wildcards
 * protected; `eq:`, `gt:`… are comparisons; `in:` a list; an inversion joins the
 * entry with AND NOT, as `ne:` does. A regular expression has no operator in a
 * filterset, and an empty value cannot be stored.
 */
export function toFiltersetEntry(
  prop: string,
  expr: string,
  source: FiltersetSource,
): TranslatedFilter {
  const column = columnOf(prop, source);
  if (column === undefined) return { prop, expr, reason: "column" };
  let not = isInverted(expr);
  const inner = not ? expr.slice(1) : expr;
  if (inner === "empty") return { prop, expr, reason: "empty" };
  if (inner.startsWith("~")) return { prop, expr, reason: "regex" };

  let op: FiltersetNewEntry["f_op"] = "LIKE";
  let value = `%${escapeLike(inner)}%`;
  if (inner.startsWith("in:")) {
    op = "IN";
    value = inner.slice("in:".length);
  } else if (inner.startsWith("ne:")) {
    op = "=";
    value = inner.slice("ne:".length);
    not = !not;
  } else {
    const comparison = COMPARISONS.find(([prefix]) => inner.startsWith(prefix));
    if (comparison !== undefined) {
      op = comparison[1];
      value = inner.slice(comparison[0].length);
    }
  }
  if (value.length > FILTER_VALUE_MAX) return { prop, expr, reason: "length" };
  return {
    prop,
    expr,
    entry: {
      f_log_op: not ? "AND NOT" : "AND",
      f_table: column.table,
      f_field: column.field,
      f_op: op,
      f_value: value,
    },
  };
}

/** Every active filter of a list, translated, in the order of the filter bar. */
export function toFiltersetEntries(
  filters: ColumnFilters,
  source: FiltersetSource,
): TranslatedFilter[] {
  return Object.entries(filters).map(([prop, expr]) => toFiltersetEntry(prop, expr, source));
}

/** How an entry reads in the composition of a filterset: `nodes.os_name LIKE %linux%`. */
export function entryLabel(entry: FiltersetNewEntry): string {
  return `${entry.f_table ?? ""}.${entry.f_field ?? ""} ${entry.f_op ?? ""} ${entry.f_value ?? ""}`;
}

/**
 * A name for the filterset, from its filters: `nodes os_name linux, not node_env DEV`.
 * Cut to the size of the column; the user changes it at will.
 */
export function suggestFiltersetName(table: string, translated: TranslatedFilter[]): string {
  const parts = translated.flatMap((item) => {
    if (!("entry" in item)) return [];
    const { entry } = item;
    const value = (entry.f_value ?? "").replace(/^%|%$/g, "").replace(/\\([\\%_])/g, "$1");
    const op =
      entry.f_op === "LIKE" || entry.f_op === "=" || entry.f_op === "IN"
        ? ""
        : `${entry.f_op ?? ""} `;
    const not = entry.f_log_op === "AND NOT" ? "not " : "";
    return [`${entry.f_field ?? ""} ${not}${op}${value}`];
  });
  return `${table} ${parts.join(", ")}`.slice(0, FILTERSET_NAME_MAX).trim();
}
