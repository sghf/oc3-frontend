import { useSyncExternalStore } from "react";

/**
 * Who is signed in, and how.
 *
 * Two modes. With OpenID Connect, oc3 holds the tokens (Backend for Frontend):
 * the browser only carries an HttpOnly session cookie that no script can read, so
 * `password` is absent and nothing secret lives here. With the collector password
 * (HTTP Basic, kept during the transition), the credentials stay in session storage
 * for the lifetime of the tab and go in the Authorization header of every request.
 */
export interface Credentials {
  /** Email of the account, its sign-in name. */
  user: string;
  /** The collector password, for HTTP Basic only; absent with an OIDC session. */
  password?: string;
}

/**
 * Where the sign-in stands: being checked at load (a session cookie may be there),
 * signed out, signed in, or signed in through a session that the server no longer
 * accepts, which the shell reports without dropping the page.
 */
export type AuthStatus = "checking" | "signed-out" | "signed-in" | "expired";

const STORAGE_KEY = "oc3.credentials";

/** Basic credentials kept by the tab; an OIDC session is never stored here. */
function read(): Credentials | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "user" in parsed &&
      "password" in parsed &&
      typeof parsed.user === "string" &&
      typeof parsed.password === "string"
    ) {
      return { user: parsed.user, password: parsed.password };
    }
    return null;
  } catch {
    // Storage unreadable or refused: we start again from an empty session.
    return null;
  }
}

let current: Credentials | null = read();
// Stored Basic credentials sign in at once; otherwise a session cookie may be
// there, which only the server can tell.
let status: AuthStatus = current === null ? "checking" : "signed-in";
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function setCredentials(next: Credentials | null): void {
  const nextStatus: AuthStatus = next === null ? "signed-out" : "signed-in";
  // The status counts too: a check at load ends with no credentials, as it began.
  if (next === current && nextStatus === status) return;
  current = next;
  status = nextStatus;
  try {
    if (next?.password === undefined) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or storage refused: the session does not survive a reload.
  }
  notify();
}

/** Marks the OIDC session as refused by the server, the identity kept on display. */
export function setSessionExpired(): void {
  if (status === "expired") return;
  status = current === null ? "signed-out" : "expired";
  notify();
}

export function useCredentials(): Credentials | null {
  return useSyncExternalStore(subscribe, () => current);
}

export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(subscribe, () => status);
}

export function currentCredentials(): Credentials | null {
  return current;
}

export function currentAuthStatus(): AuthStatus {
  return status;
}

/** Whether the sign-in is an OIDC session, whose secret is the cookie. */
export function isSession(credentials: Credentials | null): boolean {
  return credentials !== null && credentials.password === undefined;
}

/** The Basic Authorization header carrying these credentials. */
export function basicHeader(credentials: { user: string; password: string }): string {
  // btoa only accepts latin-1: go through the UTF-8 encoding of the bytes.
  const bytes = new TextEncoder().encode(`${credentials.user}:${credentials.password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

/**
 * Authorization header of the current request: the Basic credentials, or null for
 * an OIDC session, the cookie going with the request on its own.
 */
export function authorizationHeader(): string | null {
  return current?.password === undefined
    ? null
    : basicHeader({ user: current.user, password: current.password });
}

/** The URL starting an OIDC sign-in, back to `returnTo` once signed in. */
export function loginUrl(returnTo: string): string {
  return `/api/auth/login?return_to=${encodeURIComponent(returnTo)}`;
}

/** The current route of the SPA, to come back to after signing in. */
export function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * Why the last OIDC sign-in failed, as the callback reports it in `auth_error`.
 * Read once at load, then taken out of the address bar.
 */
export const initialAuthError: string | null = (() => {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("auth_error");
    if (code === null) return null;
    url.searchParams.delete("auth_error");
    window.history.replaceState(window.history.state, "", url.toString());
    return code;
  } catch {
    return null;
  }
})();
