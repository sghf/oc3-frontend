import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import type { ValueList } from "@/components/opensvc/DetailPanel";

export type FieldConstraint = components["schemas"]["FieldConstraint"];
export type FieldConstraintMode = components["schemas"]["FieldConstraintMode"];
export type FieldConstraintKind = components["schemas"]["FieldConstraintObjectKind"];

/** Root of the query keys, refreshed when `field_constraints` changes. */
export const FIELD_CONSTRAINTS_KEY = "field-constraints";

/**
 * The constraints of the attributes of a kind of object: `data`, the constrained
 * attributes only, the others being free text, the default; `fields`, those oc3
 * lets constrain.
 */
export function useFieldConstraints(kind: FieldConstraintKind | undefined) {
  return useQuery({
    queryKey: [FIELD_CONSTRAINTS_KEY, kind],
    enabled: kind !== undefined,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET("/field_constraints/{object_kind}", {
        params: { path: { object_kind: kind ?? "node" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

/** The value lists of the constrained attributes, by attribute, for `DetailContent`. */
export function valueLists(constraints: FieldConstraint[] | undefined): Record<string, ValueList> {
  const out: Record<string, ValueList> = {};
  for (const c of constraints ?? [])
    out[c.field] =
      c.mode === "regex"
        ? { values: [], strict: true, pattern: c.pattern }
        : { values: c.values, strict: c.mode === "strict" };
  return out;
}
