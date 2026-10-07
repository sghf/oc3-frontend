import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

export type ClaimMappingRow = components["schemas"]["OidcMappingRow"];

export const MAPPING_PROPS = "id,claim,value,allow_access,group_ids,group_roles,author,updated";

/** A claim rule, for its detail and its edit form. */
export function useClaimMapping(id: string | undefined) {
  return useQuery({
    queryKey: ["claim-mapping", id],
    enabled: id !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/oidc_mappings/{mapping_id}", {
        params: { path: { mapping_id: Number(id) }, query: { props: MAPPING_PROPS } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: ClaimMappingRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });
}

export interface Team {
  id: number;
  role: string;
}

/**
 * The teams a rule grants, from the two lists the API gives in the same order:
 * the ids, comma separated, and the names, comma and space separated.
 */
export function teamsOf(row: ClaimMappingRow): Team[] {
  const ids = (row.group_ids ?? "").split(",").filter((id) => id !== "");
  const roles = (row.group_roles ?? "").split(", ");
  return ids.map((id, index) => ({ id: Number(id), role: roles[index] ?? id }));
}

/**
 * The teams a rule may grant: all of them but Everybody and the private teams of the
 * users, which the server refuses since a rule's teams follow the claims.
 */
export function useGrantableTeams() {
  return useQuery({
    queryKey: ["groups", "grantable"],
    queryFn: async () => {
      const { data, error } = await api.GET("/groups", {
        params: { query: { props: "id,role", orderby: "role", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      return rows
        .flatMap((row): Team[] =>
          typeof row.id === "number" && typeof row.role === "string"
            ? [{ id: row.id, role: row.role }]
            : [],
        )
        .filter((team) => team.role !== "Everybody" && !team.role.startsWith("user_"));
    },
  });
}

/**
 * The claims of the current OpenID Connect sign-in that a rule may use: what the
 * provider sends, for whoever writes the rules. Empty when signed in otherwise.
 */
export function useCurrentClaims() {
  return useQuery({
    queryKey: ["auth", "claims"],
    queryFn: async () => {
      const { data, error } = await api.GET("/auth/claims");
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}

/** A claim as text values, one per item of a list: what a rule compares. */
export function claimValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(claimValues);
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  return [];
}

/**
 * The claims flattened into names a rule can use: a nested claim gives dotted paths
 * (realm_access.roles), as the server reads them.
 */
export function flattenClaims(claims: Record<string, unknown>, prefix = ""): [string, string[]][] {
  return Object.entries(claims).flatMap(([key, value]): [string, string[]][] => {
    const name = prefix === "" ? key : `${prefix}.${key}`;
    if (value !== null && typeof value === "object" && !Array.isArray(value))
      return flattenClaims(value as Record<string, unknown>, name);
    const values = claimValues(value);
    return values.length === 0 ? [] : [[name, values]];
  });
}
