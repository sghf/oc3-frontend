import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { TransientNotice } from "@/components/ui/TransientNotice";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { isSession, setCredentials, useCredentials } from "@/lib/api/auth";
import { useImpersonation } from "@/lib/api/impersonation";
import { ProfileCard } from "./ProfileCard";

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

/**
 * The shortest password accepted when changing one's own, as the API requires
 * (`POST /users/self/password`); stricter than at user creation.
 */
const MIN_LENGTH = 12;

type Field = "current" | "next" | "confirm";

const EMPTY: Record<Field, string> = { current: "", next: "", confirm: "" };

/**
 * Change of the signed-in user's password, who gives the current one. Folded
 * behind a button, an occasional action not to take the room of the page. The
 * checks the server makes are made here first, field by field; the current
 * password can only be checked by the server. Once changed, the session carries
 * on with the new password: HTTP Basic sends it with every request.
 */
export function PasswordSection({ email }: { email: string | undefined }) {
  const { t } = useTranslation();
  const credentials = useCredentials();
  const impersonation = useImpersonation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<Field, string>>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  // The change whose report was dismissed, or left by itself: by when it was asked.
  const [dismissedChange, setDismissedChange] = useState<number | null>(null);
  const change = useMutation({
    mutationFn: async ({ current, next }: { current: string; next: string }) => {
      const { error, response } = await api.POST("/users/self/password", {
        body: { current_password: current, new_password: next },
      });
      if (error !== undefined) {
        throw new Error(
          response.status === 403 ? t("profile.password.wrongCurrent") : problemText(error),
        );
      }
      return next;
    },
    onSuccess: (next) => {
      // Basic credentials go on with the new password; a session needs nothing.
      if (credentials !== null && !isSession(credentials))
        setCredentials({ ...credentials, password: next });
      close();
    },
  });

  function close() {
    setOpen(false);
    setValues(EMPTY);
    setTouched(false);
    setVisible(false);
    // The focus goes back to the button that opened the form.
    window.setTimeout(() => opener.current?.focus(), 0);
  }

  const problems: Partial<Record<Field, string>> = {};
  if (values.current === "") problems.current = t("profile.password.required");
  // Counted in characters, as the server does: an accented letter counts once.
  if (Array.from(values.next).length < MIN_LENGTH)
    problems.next = t("profile.password.tooShort", { count: MIN_LENGTH });
  else if (values.next === values.current) problems.next = t("profile.password.same");
  if (values.confirm !== values.next) problems.confirm = t("profile.password.mismatch");
  const valid = Object.keys(problems).length === 0;

  const field = (name: Field, autoComplete: string, autoFocus = false) => {
    const problem = touched ? problems[name] : undefined;
    return (
      <div>
        <label htmlFor={`${id}-${name}`} className="mb-1 block font-medium">
          {t(`profile.password.fields.${name}`)}
        </label>
        <input
          id={`${id}-${name}`}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={values[name]}
          aria-invalid={problem !== undefined}
          aria-describedby={problem === undefined ? undefined : `${id}-${name}-problem`}
          onChange={(event) => {
            setValues({ ...values, [name]: event.target.value });
            change.reset();
          }}
          className={`${INPUT} ${problem === undefined ? "" : "border-state-down"}`}
        />
        {problem !== undefined && (
          <p id={`${id}-${name}-problem`} className="mt-1 text-state-down">
            ■ {problem}
          </p>
        )}
      </div>
    );
  };

  return (
    <ProfileCard
      title={t("profile.password.title")}
      family="security"
      hint={t("profile.password.hint", { count: MIN_LENGTH })}
    >
      {impersonation !== null ? (
        // The server refuses it: a password is changed only by its owner.
        <p className="text-ink-muted">{t("impersonation.noPassword")}</p>
      ) : isSession(credentials) ? (
        // Signed in through the identity provider: the password lives there.
        <p className="text-ink-muted">{t("profile.password.managedByProvider")}</p>
      ) : !open ? (
        <div className="space-y-2">
          <button
            ref={opener}
            type="button"
            aria-expanded={false}
            onClick={() => {
              setOpen(true);
              change.reset();
            }}
            className="h-8 rounded-(--radius-control) border border-line bg-surface px-3 hover:border-line-strong"
          >
            {t("profile.password.open")}
          </button>
          {change.isSuccess && dismissedChange !== change.submittedAt && (
            <TransientNotice
              id={change.submittedAt}
              tone="success"
              text={t("profile.password.done")}
              dismissLabel={t("actionsMenu.dismiss")}
              onDismiss={() => {
                setDismissedChange(change.submittedAt);
              }}
            />
          )}
        </div>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (valid) change.mutate({ current: values.current, next: values.next });
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          {/* The account name, for password managers to file the new password under it. */}
          <input type="text" autoComplete="username" value={email ?? ""} readOnly hidden />
          {field("current", "current-password", true)}
          {field("next", "new-password")}
          {field("confirm", "new-password")}
          <label className="flex items-center gap-2 text-ink-muted">
            <input
              type="checkbox"
              checked={visible}
              onChange={(event) => {
                setVisible(event.target.checked);
              }}
            />
            {t("profile.password.show")}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={change.isPending}
              className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
            >
              {change.isPending ? t("profile.password.pending") : t("profile.password.submit")}
            </button>
            <button
              type="button"
              onClick={close}
              className="h-8 rounded-(--radius-control) border border-line bg-surface px-3 hover:border-line-strong"
            >
              {t("detail.cancel")}
            </button>
          </div>
          {change.isError && (
            <p role="alert" className="text-state-down">
              ■ {change.error.message}
            </p>
          )}
        </form>
      )}
    </ProfileCard>
  );
}
