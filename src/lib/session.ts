import {
  currentAuthStatus,
  currentCredentials,
  isSession,
  setCredentials,
  setSessionExpired,
} from "@/lib/api/auth";
import { impersonationHeader, setImpersonation, type Impersonation } from "@/lib/api/impersonation";
import { queryClient } from "@/lib/query";

/**
 * Ends the session in the tab: forgets the identity and the impersonation, and
 * empties the query cache.
 *
 * Without the last part, whoever signs in next in the same tab would see, for as
 * long as `staleTime` lasts, the data loaded for the previous user: query keys do not
 * carry the user, and `["user", "self"]` means "the signed-in user", whoever that is.
 */
export function signOut(): void {
  queryClient.clear();
  setImpersonation(null);
  setCredentials(null);
}

/**
 * A request was refused for want of a valid sign-in. Basic credentials that no
 * longer work go back to the sign-in screen. An OIDC session that ended (idle,
 * maximum lifetime, signed out elsewhere) is reported over the page instead, so
 * that a form being filled is not lost before the user chooses to sign in again.
 */
export function sessionRefused(): void {
  const status = currentAuthStatus();
  // Already signed out: nothing to undo. Emptying the cache again would also throw
  // away what the sign-in screen loads, such as the sign-in modes.
  if (status === "signed-out") return;
  if (status === "checking") {
    setCredentials(null);
    return;
  }
  if (status === "signed-in" && isSession(currentCredentials())) {
    setSessionExpired();
    return;
  }
  if (status !== "expired") signOut();
}

/**
 * Acts as another user from now on, or with null as oneself again. The cache goes
 * for the same reason as at sign-out: the views reload as the new identity.
 */
function switchIdentity(next: Impersonation | null): void {
  // Several requests in flight may be refused together: one switch is enough.
  if (next === null && impersonationHeader() === null) return;
  queryClient.clear();
  setImpersonation(next);
}

export function startImpersonating(target: Impersonation): void {
  switchIdentity(target);
}

export function stopImpersonating(): void {
  switchIdentity(null);
}
