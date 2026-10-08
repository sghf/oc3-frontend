import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import type { HistoryObjectKind } from "./compliance-diff";

export type ComplianceVersion = components["schemas"]["ComplianceVersion"];
export type ComplianceVersionDetail = components["schemas"]["ComplianceVersionDetail"];

/** An object of the compliance history, by kind and id: the id follows its renames. */
export interface HistoryObject {
  kind: HistoryObjectKind;
  id: number;
  name: string;
}

/**
 * The versions of the compliance export, newest first: all of them, or those in
 * which `object` changed.
 */
export function useComplianceHistory(
  object: HistoryObject | null,
  limit: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["compliance-history", object?.kind, object?.id, limit],
    enabled,
    queryFn: async () => {
      const { data, error } = await api.GET("/compliance/history", {
        params: {
          query: {
            limit,
            object: object === null ? undefined : `${object.kind}:${String(object.id)}`,
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data.data;
    },
  });
}

/** A version with the export it recorded and the one before. A commit never changes. */
export function useComplianceVersion(commit: string | null) {
  return useQuery({
    queryKey: ["compliance-version", commit],
    enabled: commit !== null,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await api.GET("/compliance/history/{commit}", {
        params: { path: { commit: commit ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

/**
 * What a version records: a designer commit, or the export as found before one,
 * with the changes made elsewhere. The versions recorded before the source was
 * kept are told apart by the subject the designer gave the latter.
 */
export function versionSource(version: ComplianceVersion): "designer" | "elsewhere" {
  if (version.source === "designer" || version.source === "elsewhere") return version.source;
  return version.subject.startsWith("Compliance export as found") ? "elsewhere" : "designer";
}
