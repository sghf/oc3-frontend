import { EMPTY_VALUE, type ColumnFilters } from "./column-filters";
import type { ListPage } from "./api/page";
import type { ResolvedListSearch } from "./list-search";
import { STATS_LIMIT, type ValueStats } from "./api/value-stats";

/**
 * A list held whole in the browser, its rows not read from a SQL list of
 * apicollector: the compliance modules, from git. It answers the filters, the
 * sort and the page of the URL as the API answers them (oc3
 * server/handlers/list_filters.go), for `CollectorList` to show it as any
 * other list.
 *
 *     text        contains, case-insensitive
 *     ~regex      regular expression, case-insensitive
 *     in:a,b      one of the values
 *     eq: ne: gt: gte: lt: lte:   comparisons; "-1d12h" is a date that long ago
 *     empty       no value
 *     !expr       the inverse, the rows without a value included
 *
 * The comparisons are case-insensitive, as the collation of the collector
 * tables makes them; numbers compare as numbers, dates as dates.
 */

/** A value of a row for a prop: what the cells show, before formatting. */
export type ReadProp<T> = (row: T, prop: string) => string | number | boolean | undefined;

type Value = string | number | boolean | undefined;

function isEmpty(value: Value): boolean {
  return value === undefined || value === "";
}

function text(value: Value): string {
  return value === undefined ? "" : String(value).toLowerCase();
}

const RELATIVE = /^-(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;

/** A date "-1d12h" ago, or undefined when value is not one. */
function relativeDate(value: string): number | undefined {
  const m = RELATIVE.exec(value);
  if (m === null || value === "-") return undefined;
  const units = [7 * 86400, 86400, 3600, 60, 1];
  let seconds = 0;
  units.forEach((unit, i) => {
    const n = m[i + 1];
    if (n !== undefined) seconds += Number(n) * unit;
  });
  return Date.now() - seconds * 1000;
}

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}/;

/** -1, 0 or 1: a against b, as numbers, dates, or case-insensitive text. */
function compare(a: Value, b: string): number {
  const relative = relativeDate(b);
  if (relative !== undefined) {
    const date = typeof a === "string" ? Date.parse(a) : NaN;
    return Number.isNaN(date) ? -1 : Math.sign(date - relative);
  }
  if (
    typeof a === "number" ||
    (typeof a === "string" && a.trim() !== "" && !Number.isNaN(Number(a)))
  ) {
    const right = Number(b);
    if (b.trim() !== "" && !Number.isNaN(right)) return Math.sign(Number(a) - right);
  }
  if (typeof a === "string" && DATE_LIKE.test(a) && DATE_LIKE.test(b)) {
    const left = Date.parse(a);
    const right = Date.parse(b);
    if (!Number.isNaN(left) && !Number.isNaN(right)) return Math.sign(left - right);
  }
  return Math.sign(text(a).localeCompare(b.toLowerCase()));
}

const COMPARISONS: [string, (c: number) => boolean][] = [
  ["eq:", (c) => c === 0],
  ["ne:", (c) => c !== 0],
  ["gte:", (c) => c >= 0],
  ["gt:", (c) => c > 0],
  ["lte:", (c) => c <= 0],
  ["lt:", (c) => c < 0],
];

/**
 * Whether a value passes a filter expression. An invalid regular expression
 * passes nothing: the API refuses it, and the filter shows its error.
 */
export function matchesFilter(value: Value, expr: string): boolean {
  if (expr === "") return true;
  if (expr.startsWith("!") && expr !== "!") {
    const inner = expr.slice(1);
    if (inner === "empty") return !isEmpty(value);
    return isEmpty(value) || !matchesFilter(value, inner);
  }
  if (expr === "empty") return isEmpty(value);
  if (isEmpty(value)) return false;
  if (expr.startsWith("~")) {
    try {
      return new RegExp(expr.slice(1), "i").test(String(value));
    } catch {
      return false;
    }
  }
  if (expr.startsWith("in:")) {
    const v = text(value);
    return expr
      .slice(3)
      .split(",")
      .some((item) => item.toLowerCase() === v);
  }
  for (const [prefix, test] of COMPARISONS) {
    if (expr.startsWith(prefix)) return test(compare(value, expr.slice(prefix.length)));
  }
  return text(value).includes(expr.toLowerCase());
}

/** The rows every filter keeps. */
export function filterRows<T>(rows: readonly T[], filters: ColumnFilters, read: ReadProp<T>): T[] {
  const active = Object.entries(filters).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "",
  );
  if (active.length === 0) return [...rows];
  return rows.filter((row) => active.every(([prop, expr]) => matchesFilter(read(row, prop), expr)));
}

/** The rows in the order of the sort keys, "-prop" descending; empty values first, as SQL. */
export function sortRows<T>(rows: readonly T[], sort: readonly string[], read: ReadProp<T>): T[] {
  const keys = sort.map((key) =>
    key.startsWith("-") ? { prop: key.slice(1), sign: -1 } : { prop: key, sign: 1 },
  );
  return [...rows].sort((a, b) => {
    for (const { prop, sign } of keys) {
      const left = read(a, prop);
      const right = read(b, prop);
      let c: number;
      if (isEmpty(left) || isEmpty(right)) c = (isEmpty(left) ? 0 : 1) - (isEmpty(right) ? 0 : 1);
      else if (typeof left === "number" && typeof right === "number") c = left - right;
      else c = String(left).localeCompare(String(right), undefined, { numeric: true });
      if (c !== 0) return sign * c;
    }
    return 0;
  });
}

/** The page of the URL over the rows filtered and sorted, with their total. */
export function localPage<T>(
  rows: readonly T[],
  search: Pick<ResolvedListSearch, "filters" | "sort" | "offset" | "limit">,
  read: ReadProp<T>,
): ListPage<T> {
  const kept = sortRows(filterRows(rows, search.filters, read), search.sort, read);
  // A limit of 0 is every row, as the API reads it.
  const end = search.limit === 0 ? kept.length : search.offset + search.limit;
  return {
    rows: kept.slice(search.offset, end),
    hasMore: end < kept.length,
    total: kept.length,
  };
}

/** The distribution of a column over the rows the filters keep, as `stats=1` answers it. */
export function localValueStats<T>(
  rows: readonly T[],
  prop: string,
  filters: ColumnFilters,
  read: ReadProp<T>,
): ValueStats {
  const kept = filterRows(rows, filters, read);
  const counts = new Map<string, number>();
  for (const row of kept) {
    const value = read(row, prop);
    // An empty value counts as "empty", as the API names it.
    const key = isEmpty(value) ? EMPTY_VALUE : String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const all = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const values = all.slice(0, STATS_LIMIT);
  return {
    values,
    distinct: all.length,
    other: all.slice(STATS_LIMIT).reduce((sum, item) => sum + item.count, 0),
    total: kept.length,
  };
}
