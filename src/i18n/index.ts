import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { sv } from "./locales/sv";
import { en } from "./locales/en";

export const SUPPORTED_LANGUAGES = ["sv", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LOCALE: Record<SupportedLanguage, string> = {
  sv: "sv-SE",
  en: "en-GB",
};

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      sv: { translation: sv },
      en: { translation: en },
    },
    lng: "sv",
    fallbackLng: "sv",
    interpolation: { escapeValue: false },
    returnObjects: true,
  });
}

export default i18n;
