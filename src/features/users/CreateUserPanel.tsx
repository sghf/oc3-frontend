import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { useAuthInfo } from "@/lib/api/auth-info";
import { problemText } from "@/lib/api/problem";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { SlideOver } from "@/components/ui/SlideOver";

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

/** Minimum length imposed by `POST /users`. */
const MIN_PASSWORD = 8;

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Creating a user. The collector also creates their private group `user_<id>`.
 * Without a password the account exists but cannot sign in, as in the historical
 * collector: the form says so rather than forbidding it. With password sign-in
 * turned off (`basic` of `GET /auth/info`), the form asks for none: the user
 * signs in through the identity provider.
 */
export function CreateUserPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number | undefined) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Offered until the collector says otherwise: it refuses a password it would
  // not accept at sign-in.
  const passwords = useAuthInfo().data?.basic !== false;

  const tooShort = password !== "" && password.length < MIN_PASSWORD;
  const mismatch = confirm !== "" && confirm !== password;

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/users", {
        body: {
          email: email.trim(),
          first_name: optional(firstName),
          last_name: optional(lastName),
          username: optional(username),
          phone_work: optional(phone),
          password: !passwords || password === "" ? undefined : password,
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return Array.isArray(data.data) ? data.data[0]?.id : undefined;
    },
    onSuccess: async (id) => {
      setEmail("");
      setFirstName("");
      setLastName("");
      setUsername("");
      setPhone("");
      setPassword("");
      setConfirm("");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      onCreated(id);
      onClose();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tooShort || password !== confirm) return;
    create.mutate();
  }

  function text(
    id: string,
    label: string,
    value: string,
    set: (value: string) => void,
    props: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {},
  ) {
    return (
      <div className="mb-3">
        <label className="mb-1 block font-medium" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          value={value}
          onChange={(event) => {
            set(event.target.value);
          }}
          className={INPUT}
          {...props}
        />
      </div>
    );
  }

  return (
    <SlideOver
      open={open}
      title={t("users.create.title")}
      onClose={onClose}
      closeLabel={t("detail.close")}
      resizeLabel={t("detail.resize")}
      leading={<ObjectIcon kind="user" />}
    >
      <p className="mb-3 text-ink-muted">{t("users.create.intro")}</p>
      <form onSubmit={onSubmit}>
        {text("create-user-email", t("users.fields.email"), email, setEmail, {
          type: "email",
          required: true,
          autoComplete: "off",
        })}
        <div className="grid grid-cols-2 gap-2">
          {text("create-user-first-name", t("users.fields.first_name"), firstName, setFirstName, {
            autoComplete: "off",
          })}
          {text("create-user-last-name", t("users.fields.last_name"), lastName, setLastName, {
            autoComplete: "off",
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {text("create-user-username", t("users.fields.username"), username, setUsername, {
            autoComplete: "off",
          })}
          {text("create-user-phone", t("users.fields.phone_work"), phone, setPhone, {
            type: "tel",
            autoComplete: "off",
          })}
        </div>

        {passwords ? (
          <>
            {/* new-password: the browser does not offer the password of the current session. */}
            {text("create-user-password", t("users.create.password"), password, setPassword, {
              type: "password",
              autoComplete: "new-password",
              minLength: MIN_PASSWORD,
            })}
            {text("create-user-confirm", t("users.create.confirm"), confirm, setConfirm, {
              type: "password",
              autoComplete: "new-password",
            })}
            <p
              className={`-mt-2 mb-3 ${tooShort || mismatch ? "text-state-warn" : "text-ink-muted"}`}
            >
              {tooShort
                ? `▲ ${t("users.create.tooShort", { count: MIN_PASSWORD })}`
                : mismatch
                  ? `▲ ${t("users.create.mismatch")}`
                  : password === ""
                    ? t("users.create.noPassword")
                    : t("users.create.passwordHint", { count: MIN_PASSWORD })}
            </p>
          </>
        ) : (
          <p className="mb-3 text-ink-muted">{t("users.create.passwordsDisabled")}</p>
        )}

        {create.isError && (
          <p role="alert" className="mb-3 text-state-down">
            ■ {create.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={create.isPending || tooShort || password !== confirm}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {create.isPending ? t("users.create.submitting") : t("users.create.submit")}
        </button>
      </form>
    </SlideOver>
  );
}
