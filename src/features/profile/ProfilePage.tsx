import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { TransientNotice } from "@/components/ui/TransientNotice";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { DetailContent } from "@/components/opensvc/DetailPanel";
import { problemText } from "@/lib/api/problem";
import { EDITABLE_USER_GROUPS, USER_GROUPS, USER_PROPS_QUERY } from "@/features/users/user-fields";
import { useSaveUser } from "@/features/users/use-save-user";
import {
  hasSavedViewPrefs,
  usePalettePref,
  useResetViewPrefs,
  useThemePref,
  useLanguagePref,
  useUserPrefs,
} from "@/lib/user-prefs";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { ResetIcon } from "@/components/ui/icons";
import { PALETTES, THEMES } from "@/lib/theme";
import { LANGUAGES, browserLanguage } from "@/lib/language";
import { PasswordSection } from "./PasswordSection";
import { ProfileCard } from "./ProfileCard";

type UserRow = components["schemas"]["UserRow"];

/** The identity of the account, its name and email editable, the rest read only. */
const IDENTITY_GROUP = EDITABLE_USER_GROUPS.find((g) => g.key === "identity");

/**
 * Profile of the signed-in user, opened from their name in the top bar.
 *
 * `GET /users/self` names the caller server side: no need to know their id, and the
 * page stays right if the sign-in email changes case. The historical collector also
 * showed the groups, the application codes and the default filterset; the API does
 * not expose them per user yet, see notes.md.
 *
 * A header saying who is signed in, then cards of related settings, on two columns
 * where the screen allows: the account, whose name and email the user may change,
 * and its notifications, read only since the API offers no way to change them; the
 * password; the appearance; what the account remembers of the lists and of the menu.
 */
export function ProfilePage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["user", "self"],
    queryFn: async () => {
      const { data, error: failure } = await api.GET("/users/{user_id}", {
        params: { path: { user_id: "self" }, query: { props: USER_PROPS_QUERY } },
      });
      if (failure !== undefined) throw new Error(problemText(failure));
      const rows: UserRow[] = Array.isArray(data.data) ? data.data : [];
      return rows[0] ?? null;
    },
  });

  const fullName = [data?.first_name, data?.last_name]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
  const saveIdentity = useSaveUser("self", true);

  /** A group of the account's properties, in a card of its own titled like it. */
  const detailCard = (key: string) => {
    const group = USER_GROUPS.find((g) => g.key === key);
    return (
      <ProfileCard
        title={t(`users.detail.groups.${key}`)}
        family={group?.family}
        hint={t("profile.readOnly")}
      >
        <DetailContent
          groups={group === undefined ? [] : [group]}
          row={data}
          labelPrefix="users.fields"
          groupPrefix="users.detail.groups"
          isPending={isPending}
          errorMessage={isError ? error.message : null}
          groupTitles={false}
          labelWidth={LABEL_WIDTH}
        />
      </ProfileCard>
    );
  };

  return (
    <section className="max-w-5xl">
      <h1 className="sr-only">{t("profile.title")}</h1>
      <header className="mb-4 flex items-center gap-4 rounded-(--radius-panel) border border-line bg-surface-raised p-4">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-title font-semibold text-ink"
        >
          {initials(fullName, data?.email)}
        </span>
        <div className="min-w-0">
          <p className="text-ink-muted">{t("profile.title")}</p>
          <p className="truncate text-title font-semibold">
            {fullName === "" ? (data?.email ?? "…") : fullName}
          </p>
          {data !== undefined && data !== null && (
            <p className="truncate text-ink-muted">
              {[data.email, data.username].filter((v) => v !== undefined && v !== "").join(" · ")}
            </p>
          )}
        </div>
      </header>

      {/* Rows of two cards rather than two independent columns: the cards of a row
          share their height, and every row starts on the same line. The account's
          properties go left, what the user sets goes right. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCard
          title={t("users.detail.groups.identity")}
          family={IDENTITY_GROUP?.family}
          hint={t("profile.identity.hint")}
        >
          <DetailContent
            groups={IDENTITY_GROUP === undefined ? [] : [IDENTITY_GROUP]}
            row={data}
            labelPrefix="users.fields"
            groupPrefix="users.detail.groups"
            isPending={isPending}
            errorMessage={isError ? error.message : null}
            groupTitles={false}
            labelWidth={LABEL_WIDTH}
            onSave={saveIdentity}
            editHint={t("profile.identity.editHint")}
          />
        </ProfileCard>
        <PasswordSection email={data?.email ?? undefined} />
        {detailCard("notifications")}
        <AppearanceCard />
        {detailCard("restrictions")}
        <SavedSettingsCard />
      </div>
    </section>
  );
}

/** One label width for every list of the page, so that their values line up. */
const LABEL_WIDTH = "11rem";

/** Up to two letters naming the user: of their name, else of their email. */
function initials(fullName: string, email: string | null | undefined): string {
  const words = fullName.split(/\s+/).filter((w) => w !== "");
  if (words.length > 0)
    return words
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  return (email ?? "?").slice(0, 1).toUpperCase();
}

/** Theme and light or dark mode, the two sides of how the interface looks, and its language. */
function AppearanceCard() {
  const { t } = useTranslation();
  const theme = useThemePref();
  const palette = usePalettePref();
  const language = useLanguagePref();
  return (
    <ProfileCard
      title={t("profile.appearance.title")}
      family="env"
      hint={t("profile.appearance.hint")}
    >
      <div className="grid gap-3">
        <div>
          <p className="mb-1 font-medium">{t("profile.palette.title")}</p>
          <ChoiceGroup
            name="palette"
            label={t("profile.palette.title")}
            options={PALETTES}
            optionLabel={(value) => t(`profile.palette.options.${value}`)}
            choice={palette}
          />
          <p className="mt-1 text-ink-muted">{t("profile.palette.hint")}</p>
        </div>
        <div>
          <p className="mb-1 font-medium">{t("profile.theme.title")}</p>
          <ChoiceGroup
            name="theme"
            label={t("profile.theme.title")}
            options={THEMES}
            optionLabel={(value) => t(`profile.theme.options.${value}`)}
            choice={theme}
          />
        </div>
        <div>
          <p className="mb-1 font-medium">{t("profile.language.title")}</p>
          <ChoiceGroup
            name="language"
            label={t("profile.language.title")}
            options={LANGUAGES}
            optionLabel={(value) =>
              value === "system"
                ? t("profile.language.system", {
                    language: t(`profile.language.options.${browserLanguage()}`),
                  })
                : t(`profile.language.options.${value}`)
            }
            choice={language}
          />
          <p className="mt-1 text-ink-muted">{t("profile.language.hint")}</p>
        </div>
      </div>
    </ProfileCard>
  );
}

/** What the account remembers of the lists, and how to forget it. */
function SavedSettingsCard() {
  const { t } = useTranslation();
  const prefs = useUserPrefs();
  const resetViews = useResetViewPrefs();
  // The reset whose report was dismissed, or left by itself: by when it was asked.
  const [dismissedReset, setDismissedReset] = useState<number | null>(null);
  return (
    <ProfileCard title={t("profile.saved.title")} family="team" hint={t("profile.saved.hint")}>
      <div className="grid gap-3">
        <div>
          <p className="mb-1 font-medium">{t("profile.viewPrefs.title")}</p>
          <p className="mb-2 text-ink-muted">{t("profile.viewPrefs.hint")}</p>
          {hasSavedViewPrefs(prefs.data) ? (
            <ConfirmButton
              icon={<ResetIcon />}
              label={t("profile.viewPrefs.reset")}
              question={t("profile.viewPrefs.question")}
              confirmLabel={t("profile.viewPrefs.confirm")}
              cancelLabel={t("detail.cancel")}
              pendingLabel={t("profile.viewPrefs.pending")}
              pending={resetViews.isPending}
              onConfirm={resetViews.reset}
            />
          ) : (
            <>
              {/* The state in place; the report of the reset floats over the page. */}
              <p className="text-ink-muted">{t("profile.viewPrefs.none")}</p>
              {resetViews.doneAt !== null && dismissedReset !== resetViews.doneAt && (
                <TransientNotice
                  id={resetViews.doneAt}
                  tone="success"
                  text={t("profile.viewPrefs.done")}
                  dismissLabel={t("actionsMenu.dismiss")}
                  onDismiss={() => {
                    setDismissedReset(resetViews.doneAt);
                  }}
                />
              )}
            </>
          )}
          {resetViews.errorMessage !== null && (
            <p role="alert" className="mt-2 text-state-down">
              ■ {resetViews.errorMessage}
            </p>
          )}
        </div>
      </div>
    </ProfileCard>
  );
}

/** Radio group of an appearance choice, saved as soon as it changes. */
function ChoiceGroup<V extends string>({
  name,
  label,
  options,
  optionLabel,
  choice,
}: {
  name: string;
  label: string;
  options: readonly V[];
  optionLabel: (value: V) => string;
  choice: { value: V; set: (value: V) => void; isSaving: boolean; errorMessage: string | null };
}) {
  return (
    <>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((value) => (
          <label
            key={value}
            className="flex h-7 cursor-pointer items-center gap-1.5 rounded-(--radius-control) border border-line px-3 has-checked:border-accent has-checked:bg-accent-soft has-checked:text-ink"
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={choice.value === value}
              disabled={choice.isSaving}
              onChange={() => {
                choice.set(value);
              }}
            />
            {optionLabel(value)}
          </label>
        ))}
      </div>
      {choice.errorMessage !== null && (
        <p role="alert" className="mt-2 text-state-down">
          ■ {choice.errorMessage}
        </p>
      )}
    </>
  );
}
