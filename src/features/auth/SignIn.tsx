import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import {
  basicHeader,
  currentRoute,
  initialAuthError,
  loginUrl,
  setCredentials,
} from "@/lib/api/auth";
import { problemText } from "@/lib/api/problem";
import opensvcLogo from "@/assets/opensvc-logo.svg";

/** The failure codes of an OIDC sign-in the callback reports, with a message each. */
const AUTH_ERRORS = new Set([
  "denied",
  "expired",
  "state",
  "token",
  "unknown_user",
  "not_allowed",
  "locked",
  "unavailable",
]);

/** The sign-in modes the collector offers (`GET /auth/info`). */
function useAuthInfo() {
  return useQuery({
    queryKey: ["auth", "info"],
    queryFn: async () => {
      const { data, error } = await api.GET("/auth/info");
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
    // The provider may become reachable while the screen is open.
    refetchInterval: (query) =>
      query.state.data?.oidc.enabled === true && !query.state.data.oidc.ready ? 10_000 : false,
  });
}

/**
 * Sign-in screen.
 *
 * With OpenID Connect enabled, a button sends the browser to the provider through
 * oc3, which comes back to the route on display once signed in; nothing secret
 * ever reaches this page. The collector password form stays while oc3 still
 * accepts it (`basic`), during the transition. Its credentials are checked on
 * `GET /users/self` with their own header, and only kept once accepted: kept
 * first, the whole interface would render at once, its requests would be refused,
 * and the sign-out that follows would remount this form empty, the reason of the
 * failure lost.
 */
export function SignIn() {
  const { t } = useTranslation();
  const info = useAuthInfo();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  // Why the sign-in failed: the credentials refused (401), or the collector unable
  // to check them — a database down answers 503 — with the server's message.
  const [failure, setFailure] = useState<{ rejected: true } | { unavailable: string } | null>(null);
  const oidcError =
    initialAuthError === null
      ? null
      : AUTH_ERRORS.has(initialAuthError)
        ? initialAuthError
        : "token";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailure(null);
    try {
      const { error, response } = await api.GET("/users/{user_id}", {
        params: { path: { user_id: "self" }, query: { props: "id" } },
        headers: { Authorization: basicHeader({ user, password }) },
      });
      if (error === undefined) {
        setCredentials({ user, password });
        return;
      }
      setFailure(
        response.status === 401 ? { rejected: true } : { unavailable: problemText(error) },
      );
    } catch (caught) {
      // The collector did not answer at all.
      setFailure({ unavailable: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setPending(false);
    }
  }

  const oidc = info.data?.oidc;
  // Without the answer, the password form is offered: it is what the collector
  // accepted before OIDC, and the server says no if it is turned off.
  const basic = info.data?.basic ?? true;

  return (
    <div className="mx-auto mt-16 w-full max-w-sm">
      {/* Same mark as the top bar, which the sign-in screen replaces. */}
      <div className="mb-6 flex flex-col items-center gap-2">
        <img src={opensvcLogo} alt="" width={56} height={56} className="h-14 w-14" />
        <p className="text-title font-semibold tracking-tight">OpenSVC Collector</p>
      </div>

      <div className="flex flex-col gap-4 rounded-(--radius-panel) border border-line bg-surface-raised p-4">
        <h1 className="text-title font-semibold">{t("auth.title")}</h1>

        {oidcError !== null && (
          <p role="alert" className="text-state-down">
            ■ {t(`auth.oidcErrors.${oidcError}`)}
          </p>
        )}

        {oidc?.enabled === true && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={!oidc.ready}
              onClick={() => {
                window.location.assign(loginUrl(currentRoute()));
              }}
              className="h-9 w-full rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
            >
              {t("auth.oidcSignIn")}
            </button>
            {!oidc.ready && (
              <p role="status" className="text-ink-muted">
                {t("auth.oidcUnavailable")}
              </p>
            )}
          </div>
        )}

        {basic && (
          <form
            onSubmit={(event) => {
              void onSubmit(event);
            }}
            className={oidc?.enabled === true ? "border-t border-line pt-4" : undefined}
          >
            <p className="mb-3 text-ink-muted">
              {oidc?.enabled === true ? t("auth.passwordIntro") : t("auth.intro")}
            </p>

            <label className="mb-1 block font-medium" htmlFor="signin-user">
              {t("auth.user")}
            </label>
            <input
              id="signin-user"
              name="username"
              autoComplete="username"
              required
              value={user}
              onChange={(event) => {
                setUser(event.target.value);
              }}
              className="mb-3 h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2"
            />

            <label className="mb-1 block font-medium" htmlFor="signin-password">
              {t("auth.password")}
            </label>
            <input
              id="signin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              className="mb-3 h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2"
            />

            {failure !== null && (
              <p role="alert" className="mb-3 text-state-down">
                ■{" "}
                {"rejected" in failure
                  ? t("auth.rejected")
                  : t("auth.unavailable", { reason: failure.unavailable })}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className={`h-8 w-full rounded-(--radius-control) px-3 font-medium disabled:opacity-60 ${
                oidc?.enabled === true
                  ? "border border-line text-ink hover:bg-surface-sunken"
                  : "bg-accent text-accent-ink"
              }`}
            >
              {pending ? t("auth.signingIn") : t("auth.signIn")}
            </button>
          </form>
        )}

        {!basic && oidc?.enabled !== true && info.isSuccess && (
          <p role="alert" className="text-state-down">
            ■ {t("auth.noMode")}
          </p>
        )}
      </div>
    </div>
  );
}
