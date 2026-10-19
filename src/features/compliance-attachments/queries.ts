import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { toPage, type ListPage } from "@/lib/api/page";
import { toValueStats, STATS_LIMIT, type ValueStats } from "@/lib/api/value-stats";
import { filterQuery, type ColumnFilters } from "@/lib/column-filters";
import type { ResolvedListSearch } from "@/lib/list-search";
import type { components } from "@/lib/api/schema";
import type { ComboboxOption } from "@/components/ui/Combobox";
import {
  toAttachmentRow,
  type AttachmentRow,
  type CellValue,
  type TableDef,
  type TableKey,
} from "./tables";

export type AttachmentPair = components["schemas"]["ComplianceAttachmentPair"];
export type AttachmentOutcome = components["schemas"]["ComplianceAttachmentOutcome"];

interface ListQuery {
  props?: string;
  orderby?: string;
  offset?: number;
  limit?: number;
  filter?: string[];
  stats?: string;
  meta?: string;
}

/** Reads one of the four lists, the same query whichever it is. */
async function getList(key: TableKey, query: ListQuery): Promise<{ data: unknown; meta: unknown }> {
  const params = { params: { query } };
  const response =
    key === "modulesets_nodes"
      ? await api.GET("/compliance/modulesets_nodes", params)
      : key === "rulesets_nodes"
        ? await api.GET("/compliance/rulesets_nodes", params)
        : key === "modulesets_services"
          ? await api.GET("/compliance/modulesets_services", params)
          : await api.GET("/compliance/rulesets_services", params);
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return { data: response.data.data, meta: response.data.meta };
}

/** The rows of a response, each with its values as the API returned them. */
function readRows(table: TableDef, data: unknown): AttachmentRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row: unknown) => {
    if (typeof row !== "object" || row === null) return [];
    const values: Record<string, CellValue> = {};
    for (const [key, value] of Object.entries(row))
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      )
        values[key] = value;
    return [toAttachmentRow(table, values)];
  });
}

/** One page of a table, with the sort, the filters and the columns of `search`. */
export async function fetchAttachments(
  table: TableDef,
  props: string,
  search: ResolvedListSearch,
): Promise<ListPage<AttachmentRow>> {
  // One row more than the page: tells whether there is a next one.
  const { data, meta } = await getList(table.key, {
    props,
    orderby: search.sort.join(","),
    offset: search.offset,
    limit: search.limit + 1,
    filter: filterQuery(search.filters),
  });
  return toPage(readRows(table, data), meta, search.limit);
}

/** Every row of the selection, filters included, for "select all the matches". */
export async function fetchAllAttachments(
  table: TableDef,
  props: string,
  filters: ColumnFilters,
): Promise<AttachmentRow[]> {
  const { data } = await getList(table.key, { props, limit: 0, filter: filterQuery(filters) });
  return readRows(table, data);
}

/** The distribution of a column's values over the selection, with the filters given. */
export async function attachmentStats(
  table: TableDef,
  prop: string,
  filters: ColumnFilters,
): Promise<ValueStats> {
  const { data, meta } = await getList(table.key, {
    props: prop,
    stats: "1",
    limit: STATS_LIMIT,
    filter: filterQuery(filters),
  });
  return toValueStats(data, meta, prop);
}

/**
 * The modulesets, or the rulesets, one can attach, as the data actions of the
 * Nodes and Services lists offer them: every moduleset, the explicit and public
 * rulesets.
 */
export async function attachableObjects(object: TableDef["object"]): Promise<ComboboxOption[]> {
  if (object === "moduleset") {
    const { data, error } = await api.GET("/compliance/modulesets", {
      params: { query: { props: "id,modset_name", orderby: "modset_name", limit: 0 } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows.flatMap((row) =>
      row.id === undefined ? [] : [{ value: String(row.id), label: row.modset_name ?? "" }],
    );
  }
  const { data, error } = await api.GET("/compliance/rulesets", {
    params: {
      query: {
        props: "id,ruleset_name",
        orderby: "ruleset_name",
        limit: 0,
        filter: ["ruleset_type:in:explicit", "ruleset_public:in:T"],
      },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.flatMap((row) =>
    row.id === undefined ? [] : [{ value: String(row.id), label: row.ruleset_name ?? "" }],
  );
}

/** The pairs a batch takes at most: the limit of POST /compliance/attachments. */
const PAIRS_PER_REQUEST = 1000;

/** Applies pairs by batches: the outcome of each, in their order. */
export async function applyPairs(
  action: "attach" | "detach",
  pairs: AttachmentPair[],
): Promise<AttachmentOutcome[]> {
  const outcomes: AttachmentOutcome[] = [];
  for (let i = 0; i < pairs.length; i += PAIRS_PER_REQUEST) {
    const { data, error } = await api.POST("/compliance/attachments", {
      body: { action, pairs: pairs.slice(i, i + PAIRS_PER_REQUEST) },
    });
    if (error !== undefined) throw new Error(problemText(error));
    outcomes.push(...data.data);
  }
  return outcomes;
}
