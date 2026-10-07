import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { currentRoute, loginUrl } from "@/lib/api/auth";
import { probeSession } from "@/lib/api/session-auth";
import { signOut } from "@/lib/session";

/** Checks once, at load, whether the browser carries an OIDC session. */
export function SessionProbe() {
  const { t } = useTranslation();
  useEffect(() => {
    void probeSession();
  }, []);
  return (
    <p role="status" className="mt-24 text-center text-ink-muted">
      {t("auth.checking")}
    </p>
  );
}

/**
 * The OIDC session ended while the interface was open: idle too long, past its
 * maximum lifetime, or signed out at the provider. The page stays, a form being
 * filled with it, and the user chooses to sign in again, back to the same route,
 * or to leave.
 */
export function SessionExpiredBanner() {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b border-state-warn bg-state-warn-soft px-3 py-1.5 text-ink"
    >
      <span>
        <span aria-hidden="true" className="text-state-warn">
          ▲
        </span>{" "}
        {t("auth.expired")}
      </span>
      <button
        type="button"
        onClick={() => {
          window.location.assign(loginUrl(currentRoute()));
        }}
        className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
      >
        {t("auth.signInAgain")}
      </button>
      <button
        type="button"
        onClick={signOut}
        className="h-7 rounded-(--radius-control) border border-line px-3 hover:bg-surface"
      >
        {t("auth.leave")}
      </button>
    </div>
  );
}
