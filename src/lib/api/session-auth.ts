import { api } from "./client";
import { currentCredentials, isSession, setCredentials } from "./auth";
import { signOut } from "@/lib/session";

/**
 * Checks at load whether the browser carries an OIDC session: the cookie is
 * HttpOnly, only the server can tell. A refusal (401) goes through the client's
 * handling, which turns the pending check into "signed out".
 */
export async function probeSession(): Promise<void> {
  try {
    const { data } = await api.GET("/users/{user_id}", {
      params: { path: { user_id: "self" }, query: { props: "email" } },
    });
    const rows = data !== undefined && Array.isArray(data.data) ? data.data : [];
    const email = rows[0]?.email;
    setCredentials(typeof email === "string" && email !== "" ? { user: email } : null);
  } catch {
    // The collector did not answer: the sign-in screen says what it can.
    setCredentials(null);
  }
}

/**
 * Signs out at the user's request. With an OIDC session, the server ends it and
 * clears its cookie, then the browser goes to the provider's end-session page
 * (RP-initiated logout), which brings it back to the collector; Basic credentials
 * are only forgotten.
 */
export async function logOut(): Promise<void> {
  if (!isSession(currentCredentials())) {
    signOut();
    return;
  }
  let logoutUrl = "";
  try {
    const { data } = await api.POST("/auth/logout");
    logoutUrl = data?.logout_url ?? "";
  } catch {
    // The collector did not answer: the tab forgets the session all the same.
  }
  signOut();
  if (logoutUrl !== "") window.location.assign(logoutUrl);
}
