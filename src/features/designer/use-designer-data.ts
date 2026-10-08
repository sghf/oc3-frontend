import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { draftFromExports, type Draft } from "./model";

type GroupRow = components["schemas"]["GroupRow"];

/**
 * The rulesets and modulesets the designer starts from, read from the export
 * endpoints: every object with its content and relations, in two requests. The
 * designer writes back only by committing its sandbox (`commit.ts`), after which
 * this is read again.
 */
export function useDesignerDraft() {
  return useQuery({
    queryKey: ["designer", "exports"],
    // The sandbox starts from one snapshot: a refetch would not reach the draft.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Draft> => {
      const [rulesets, modulesets] = await Promise.all([
        api.GET("/compliance/rulesets/export"),
        api.GET("/compliance/modulesets/export"),
      ]);
      if (rulesets.error !== undefined) throw new Error(problemText(rulesets.error));
      if (modulesets.error !== undefined) throw new Error(problemText(modulesets.error));
      return draftFromExports(rulesets.data.rulesets ?? [], {
        modulesets: modulesets.data.modulesets ?? [],
        rulesets: modulesets.data.rulesets ?? [],
      });
    },
  });
}

/** A filterset of the collector, as the designer lists it. */
export interface DesignerFilterset {
  id: number;
  name: string;
}

/**
 * Every filterset, for the list of the designer: the exports carry only those the
 * rulesets use. Read only: filtersets are edited in the Filtersets view.
 */
export function useDesignerFiltersets() {
  return useQuery({
    queryKey: ["designer", "filtersets"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DesignerFilterset[]> => {
      const { data, error } = await api.GET("/filtersets", {
        params: { query: { props: "id,fset_name", orderby: "fset_name", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: { id?: number; fset_name?: string }[] = Array.isArray(data.data) ? data.data : [];
      return rows.flatMap((row) =>
        row.id === undefined || row.fset_name === undefined
          ? []
          : [{ id: row.id, name: row.fset_name }],
      );
    },
  });
}

/**
 * The groups a compliance object can be published to or put under the
 * responsibility of: every group but the privilege ones, private groups included,
 * as the historical designer offers them.
 */
export function useComplianceGroups() {
  return useQuery({
    queryKey: ["groups", "compliance"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DesignerGroup[]> => {
      const { data, error } = await api.GET("/groups", {
        params: { query: { props: "id,role,privilege", orderby: "role", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: GroupRow[] = Array.isArray(data.data) ? data.data : [];
      return rows.flatMap((row) =>
        row.privilege === "T" || row.id === undefined || row.role === undefined
          ? []
          : [{ id: row.id, role: row.role }],
      );
    },
  });
}

/** A group of the collector, as the designer lists it. */
export interface DesignerGroup {
  id: number;
  role: string;
}

/** The variable classes: the names of the forms of type "obj", as comp_admin() lists them. */
export function useVariableClasses() {
  return useQuery({
    queryKey: ["forms", "variable-classes"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET("/forms", {
        params: {
          query: {
            props: "form_name",
            filter: ["form_type:eq:obj"],
            orderby: "form_name",
            limit: 0,
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: { form_name?: string }[] = Array.isArray(data.data) ? data.data : [];
      return rows.flatMap((row) => (row.form_name === undefined ? [] : [row.form_name]));
    },
  });
}
