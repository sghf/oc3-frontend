import i18n from "i18next";

/**
 * The language of the interface: the browser's one ("system"), or an explicit
 * choice. As the theme, the choice follows the account, in the user preferences
 * (`language`, absent for "system"), and is cached locally so that a page loads in
 * the right language before the preferences are read.
 */
export const LANGUAGES = ["system", "en", "fr"] as const;
export type LanguageChoice = (typeof LANGUAGES)[number];

const STORAGE_KEY = "oc3.language";

export function isLanguageChoice(value: unknown): value is LanguageChoice {
  return typeof value === "string" && LANGUAGES.includes(value as LanguageChoice);
}

/** The language of the browser, among those of the interface. */
export function browserLanguage(): "en" | "fr" {
  return navigator.language.startsWith("fr") ? "fr" : "en";
}

/** The language a choice shows the interface in. */
export function resolveLanguage(choice: LanguageChoice): "en" | "fr" {
  return choice === "system" ? browserLanguage() : choice;
}

/** Choice cached locally, "system" as long as nothing has been chosen. */
export function cachedLanguage(): LanguageChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLanguageChoice(stored) ? stored : "system";
  } catch {
    // Private browsing or storage refused: the browser's language will do.
    return "system";
  }
}

/** Shows the interface in the language of `choice`, and caches the choice. */
export function applyLanguage(choice: LanguageChoice): void {
  const language = resolveLanguage(choice);
  if (i18n.language !== language) void i18n.changeLanguage(language);
  document.documentElement.lang = language;
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Without the cache the language stays right: it is applied again on the next load.
  }
}

/**
 * Follows the browser's language as long as the choice is "system". Returns the
 * function that stops following it.
 */
export function watchBrowserLanguage(current: () => LanguageChoice): () => void {
  function onChange() {
    if (current() === "system") applyLanguage("system");
  }
  window.addEventListener("languagechange", onChange);
  return () => {
    window.removeEventListener("languagechange", onChange);
  };
}
