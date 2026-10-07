/**
 * Appearance of the interface, on two independent axes: the light or dark mode
 * (`Theme`: the system one, or an explicit choice), and the colour palette
 * (`Palette`: standard, high contrast, or colour-blind friendly).
 *
 * The dark tokens live under the `dark` class, the high-contrast ones under the
 * `contrast` class and the colour-blind friendly ones under the `colorblind` class
 * (`src/styles/tokens.css`), all set here on `<html>`. Both choices
 * follow the account, in the user preferences (`theme` and `palette`), but they are
 * also kept in local storage: preferences arrive after the first render, and without
 * that cache the page would briefly show the other appearance on every load.
 */
export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "oc3.theme";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value as Theme);
}

/** Theme cached locally, "system" as long as nothing has been chosen. */
export function cachedTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    // Private browsing or storage refused: the system theme will do.
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Without the cache the theme stays correct: it is applied again on the next load.
  }
}

/**
 * Follows the system setting as long as the theme is "system". Returns the
 * unsubscribe function.
 */
export function watchSystemTheme(current: () => Theme): () => void {
  const query = media();
  const onChange = () => {
    if (current() === "system") applyTheme("system");
  };
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

export const PALETTES = ["standard", "contrast", "colorblind"] as const;

export type Palette = (typeof PALETTES)[number];

const PALETTE_STORAGE_KEY = "oc3.palette";

export function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && PALETTES.includes(value as Palette);
}

/** Palette cached locally, "standard" as long as nothing has been chosen. */
export function cachedPalette(): Palette {
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
    return isPalette(stored) ? stored : "standard";
  } catch {
    return "standard";
  }
}

export function applyPalette(palette: Palette): void {
  document.documentElement.classList.toggle("contrast", palette === "contrast");
  document.documentElement.classList.toggle("colorblind", palette === "colorblind");
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, palette);
  } catch {
    // Without the cache the palette stays correct: it is applied again on the next load.
  }
}
