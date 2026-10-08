import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import type { FilterDefinition } from "./filter-definition";

type FilterRow = components["schemas"]["FilterRow"];

/**
 * Every filter with its definition, for what a new one may reuse: the columns
 * already filtered on a table, offered as suggestions, and the filter that already
 * has a given definition, which the collector would refuse to create twice.
 */
export function useFilterDefinitions(enabled = true) {
  const query = useQuery({
    queryKey: ["filters", "definitions"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await api.GET("/filters", {
        params: { query: { props: "id,f_table,f_field,f_op,f_value", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: FilterRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
  const rows = query.data ?? [];
  return {
    /** The columns filtered on `table`, sorted. */
    fieldsOf: (table: string): string[] =>
      [
        ...new Set(
          rows.flatMap((row) =>
            row.f_table === table && row.f_field !== undefined && row.f_field !== ""
              ? [row.f_field]
              : [],
          ),
        ),
      ].sort(),
    /** The id of the filter with exactly this definition, if any. */
    existing: (definition: FilterDefinition): number | undefined =>
      rows.find(
        (row) =>
          row.f_table === definition.f_table &&
          row.f_field === definition.f_field.trim() &&
          row.f_op === definition.f_op &&
          row.f_value === definition.f_value,
      )?.id,
  };
}
