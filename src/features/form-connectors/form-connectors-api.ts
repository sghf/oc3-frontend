import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

export type FormConnector = components["schemas"]["FormConnector"];
export type FormConnectorInput = components["schemas"]["FormConnectorInput"];
export type FormConnectorTestResult = components["schemas"]["FormConnectorTestResult"];
export type AuthType = components["schemas"]["FormConnectorAuthType"];
export type ConnectorMethod = components["schemas"]["FormConnectorMethod"];

export const AUTH_TYPES: AuthType[] = [
  "none",
  "basic",
  "bearer",
  "api_key",
  "oauth2_client_credentials",
];
export const METHODS: ConnectorMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** The secrets a connector may hold, which the API never returns. */
export const SECRET_KEYS = ["password", "token", "api_key", "client_secret", "client_key"] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

/**
 * The secrets an authentication uses, and the key of a client certificate: the
 * others the API does not keep.
 */
export function secretsOf(auth: AuthType, clientCert: boolean): SecretKey[] {
  const keys: SecretKey[] =
    auth === "basic"
      ? ["password"]
      : auth === "bearer"
        ? ["token"]
        : auth === "api_key"
          ? ["api_key"]
          : auth === "oauth2_client_credentials"
            ? ["client_secret"]
            : [];
  return clientCert ? [...keys, "client_key"] : keys;
}

/** The connectors, by name. */
export function useFormConnectors() {
  return useQuery({
    queryKey: ["form-connectors"],
    queryFn: async () => {
      const { data, error } = await api.GET("/form_connectors");
      if (error !== undefined) throw new Error(problemText(error));
      return data.data;
    },
  });
}

/** The groups a connector may be published to: all of them, private ones included. */
export function useConnectorGroups() {
  return useQuery({
    queryKey: ["groups", "all-roles"],
    queryFn: async () => {
      const { data, error } = await api.GET("/groups", {
        params: { query: { props: "id,role", orderby: "role", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      return rows.flatMap((row) =>
        typeof row.id === "number" && typeof row.role === "string"
          ? [{ id: row.id, role: row.role }]
          : [],
      );
    },
  });
}

/** Creates a connector, or replaces one: its saved state. */
export async function saveFormConnector(
  id: number | undefined,
  body: FormConnectorInput,
): Promise<FormConnector> {
  const { data, error } =
    id === undefined
      ? await api.POST("/form_connectors", { body })
      : await api.PUT("/form_connectors/{connector_id}", {
          params: { path: { connector_id: id } },
          body,
        });
  if (error !== undefined) throw new Error(problemText(error));
  return data;
}

export async function deleteFormConnector(id: number): Promise<void> {
  const { error } = await api.DELETE("/form_connectors/{connector_id}", {
    params: { path: { connector_id: id } },
  });
  if (error !== undefined) throw new Error(problemText(error));
}

/** Calls the connector once, as a form would. */
export async function testFormConnector(
  id: number,
  body: components["schemas"]["FormConnectorTestInput"],
): Promise<FormConnectorTestResult> {
  const { data, error } = await api.POST("/form_connectors/{connector_id}/test", {
    params: { path: { connector_id: id } },
    body,
  });
  if (error !== undefined) throw new Error(problemText(error));
  return data;
}
