import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import { cachedLanguage, resolveLanguage } from "@/lib/language";

// Every visible string goes through t(). No hard-coded string in the components.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  // The choice cached from the account, the browser's language otherwise; the
  // account's own choice applies once its preferences are read (`useAppearance`).
  lng: resolveLanguage(cachedLanguage()),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
