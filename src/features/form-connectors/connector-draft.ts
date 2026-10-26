import {
  SECRET_KEYS,
  secretsOf,
  type AuthType,
  type ConnectorMethod,
  type FormConnector,
  type FormConnectorInput,
  type SecretKey,
} from "./form-connectors-api";

/**
 * A connector as its form edits it: the lists as text, one entry per line, the
 * secrets as typed (empty keeps the one set) or marked for removal.
 */
export interface ConnectorDraft {
  name: string;
  description: string;
  baseUrl: string;
  methods: ConnectorMethod[];
  paths: string;
  networks: string;
  /** "Name: value", one header per line. */
  headers: string;
  timeout: string;
  maxKiB: string;
  authType: AuthType;
  username: string;
  apiKeyIn: "header" | "query";
  apiKeyName: string;
  tokenUrl: string;
  clientId: string;
  scopes: string;
  audience: string;
  authStyle: "header" | "params";
  caBundle: string;
  clientCert: string;
  serverName: string;
  groupIds: number[];
  secrets: Record<SecretKey, string>;
  removed: SecretKey[];
}

const NO_SECRETS = Object.fromEntries(SECRET_KEYS.map((k) => [k, ""])) as Record<SecretKey, string>;

export const EMPTY_DRAFT: ConnectorDraft = {
  name: "",
  description: "",
  baseUrl: "https://",
  methods: ["GET"],
  paths: "",
  networks: "",
  headers: "",
  timeout: "10",
  maxKiB: "5120",
  authType: "none",
  username: "",
  apiKeyIn: "header",
  apiKeyName: "",
  tokenUrl: "",
  clientId: "",
  scopes: "",
  audience: "",
  authStyle: "header",
  caBundle: "",
  clientCert: "",
  serverName: "",
  groupIds: [],
  secrets: NO_SECRETS,
  removed: [],
};

export function draftOf(c: FormConnector): ConnectorDraft {
  return {
    ...EMPTY_DRAFT,
    name: c.name,
    description: c.description,
    baseUrl: c.base_url,
    methods: c.methods,
    paths: c.paths.join("\n"),
    networks: c.networks.join("\n"),
    headers: Object.entries(c.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    timeout: String(c.timeout),
    maxKiB: String(Math.round(c.max_bytes / 1024)),
    authType: c.auth.type,
    username: c.auth.username ?? "",
    apiKeyIn: c.auth.in ?? "header",
    apiKeyName: c.auth.name ?? "",
    tokenUrl: c.auth.token_url ?? "",
    clientId: c.auth.client_id ?? "",
    scopes: c.auth.scopes ?? "",
    audience: c.auth.audience ?? "",
    authStyle: c.auth.auth_style ?? "header",
    caBundle: c.tls.ca_bundle ?? "",
    clientCert: c.tls.client_cert ?? "",
    serverName: c.tls.server_name ?? "",
    groupIds: c.groups.map((g) => g.id),
  };
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** The headers of the draft; the lines without "Name: value" are left out. */
function headersOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines(text)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    out[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return out;
}

/**
 * The body of a save: a secret typed replaces the one set, one marked removed is
 * sent null, the others are left out, kept as they are.
 */
export function inputOf(d: ConnectorDraft): FormConnectorInput {
  const secrets: NonNullable<FormConnectorInput["secrets"]> = {};
  for (const key of secretsOf(d.authType, d.clientCert.trim() !== "")) {
    if (d.removed.includes(key)) secrets[key] = null;
    else if (d.secrets[key] !== "") secrets[key] = d.secrets[key];
  }
  const opt = (s: string) => (s.trim() === "" ? undefined : s.trim());
  return {
    name: d.name.trim(),
    description: d.description.trim(),
    base_url: d.baseUrl.trim(),
    methods: d.methods,
    paths: lines(d.paths),
    networks: lines(d.networks),
    headers: headersOf(d.headers),
    timeout: Number(d.timeout),
    max_bytes: Number(d.maxKiB) * 1024,
    auth: {
      type: d.authType,
      ...(d.authType === "basic" ? { username: opt(d.username) } : {}),
      ...(d.authType === "api_key" ? { in: d.apiKeyIn, name: opt(d.apiKeyName) } : {}),
      ...(d.authType === "oauth2_client_credentials"
        ? {
            token_url: opt(d.tokenUrl),
            client_id: opt(d.clientId),
            scopes: opt(d.scopes),
            audience: opt(d.audience),
            auth_style: d.authStyle,
          }
        : {}),
    },
    tls: {
      ca_bundle: opt(d.caBundle),
      client_cert: opt(d.clientCert),
      server_name: opt(d.serverName),
    },
    groups: d.groupIds,
    secrets,
  };
}
