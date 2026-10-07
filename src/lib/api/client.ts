import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { authorizationHeader } from "./auth";
import {
  IMPERSONATE_HEADER,
  IMPERSONATION_REFUSED_HEADER,
  impersonationHeader,
} from "./impersonation";
import { sessionRefused, stopImpersonating } from "@/lib/session";

/**
 * HTTP client typed from the OpenAPI spec of the oc3 apicollector.
 * In dev, /api is proxied by Vite to OC3_API_TARGET.
 *
 * With an OIDC session the cookie goes with every request on its own (same
 * origin); with the collector password, the Basic header is added here.
 */
export const api = createClient<paths>({ baseUrl: "/api" });

/**
 * Header the server requires on the requests of a cookie session that change
 * something: only same-origin JavaScript can set it, which a forged cross-site
 * request cannot do.
 */
const CSRF_HEADER = "X-OC3-CSRF";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

api.use({
  onRequest({ request }) {
    const header = authorizationHeader();
    if (header !== null) request.headers.set("Authorization", header);
    if (!SAFE_METHODS.has(request.method.toUpperCase())) request.headers.set(CSRF_HEADER, "1");
    const impersonate = impersonationHeader();
    if (impersonate !== null) request.headers.set(IMPERSONATE_HEADER, impersonate);
    return request;
  },
  onResponse({ response }) {
    // The privilege was withdrawn or the user removed: back to one's own identity.
    if (response.headers.has(IMPERSONATION_REFUSED_HEADER)) stopImpersonating();
    // Credentials refused or session ended: back to the sign-in screen, or, for an
    // OIDC session, a notice offering to sign in again (`sessionRefused`).
    if (response.status === 401) sessionRefused();
    return response;
  },
});

/** Answer of an API call on a path known only at runtime. */
export interface DynamicResponse {
  status: number;
  body: unknown;
}

/**
 * GET on an API path known only at runtime, such as the candidates a form
 * definition fetches from any collector endpoint: the typed client needs the path
 * at compile time. Same credentials and same handling of a refused session as
 * `api`. Repeated query keys carry a list.
 */
export async function apiGetDynamic(
  path: string,
  query: Record<string, string | string[]>,
): Promise<DynamicResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  const headers = new Headers({ Accept: "application/json" });
  const header = authorizationHeader();
  if (header !== null) headers.set("Authorization", header);
  const impersonate = impersonationHeader();
  if (impersonate !== null) headers.set(IMPERSONATE_HEADER, impersonate);
  const qs = params.toString();
  const response = await fetch(`/api${path}${qs === "" ? "" : `?${qs}`}`, { headers });
  if (response.status === 401) sessionRefused();
  if (response.headers.has(IMPERSONATION_REFUSED_HEADER)) stopImpersonating();
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // Not JSON: the text itself, for the error message.
  }
  return { status: response.status, body };
}
