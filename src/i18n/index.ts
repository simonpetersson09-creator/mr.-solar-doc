import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { sv } from "./locales/sv";
import { en } from "./locales/en";
import { fi } from "./locales/fi";
import { da } from "./locales/da";
import { de } from "./locales/de";
import { cs } from "./locales/cs";
import { pl } from "./locales/pl";
import { sk } from "./locales/sk";
import { sl } from "./locales/sl";
import { hr } from "./locales/hr";
import { et } from "./locales/et";
import { lv } from "./locales/lv";
import { lt } from "./locales/lt";
import { fr } from "./locales/fr";
import { it } from "./locales/it";
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_DEFAULT_REGION,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  normaliseLanguage,
  resolveLocale,
  type SupportedLanguage,
} from "./languages";
import { loadSettings } from "@/services/settings-service";

export {
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  LANGUAGE_DEFAULT_REGION,
  isSupportedLanguage,
  normaliseLanguage,
  resolveLocale,
};
export type { SupportedLanguage };
export { LANGUAGE_NAMES } from "./languages";

/** Kept for compatibility: default formatting locale per language. */
export const LANGUAGE_LOCALE: Record<SupportedLanguage, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((lang) => [lang, resolveLocale(lang)]),
) as Record<SupportedLanguage, string>;

const resources = {
  sv: { translation: sv },
  en: { translation: en },
  fi: { translation: fi },
  da: { translation: da },
  de: { translation: de },
  cs: { translation: cs },
  pl: { translation: pl },
  sk: { translation: sk },
  sl: { translation: sl },
  hr: { translation: hr },
  et: { translation: et },
  lv: { translation: lv },
  lt: { translation: lt },
  fr: { translation: fr },
  it: { translation: it },
};

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: normaliseLanguage(loadSettings().language),
    // English is always the safety net when a translation is missing.
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    interpolation: { escapeValue: false },
    returnObjects: true,
  });
}

export default i18n;
