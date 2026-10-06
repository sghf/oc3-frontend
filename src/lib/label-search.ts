import type { i18n as I18n } from "i18next";

/**
 * Text compared without case nor accents: "securite" finds "Sécurité". The
 * ligatures are spelled out, which accents removal leaves: "noeud" finds "Nœud".
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae");
}

/**
 * Whether the label of `key` contains `needle`, already normalized
 * (normalizeSearch), in any language of the interface and not only the one on
 * display: a user reading the English menu finds "Nœuds" by typing "noeud", and
 * the other way round.
 */
export function labelMatches(i18n: I18n, key: string, needle: string): boolean {
  if (needle === "") return true;
  const languages = Object.keys(i18n.options.resources ?? {});
  return (languages.length === 0 ? [i18n.language] : languages).some((language) =>
    normalizeSearch(i18n.getFixedT(language)(key)).includes(needle),
  );
}
