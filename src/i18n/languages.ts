/**
 * Language catalogue. `language` (UI text), `locale` (formatting), `country`
 * (market rules) and `currency` are deliberately independent concepts.
 */

export const SUPPORTED_LANGUAGES = [
  "sv",
  "en",
  "fi",
  "da",
  "de",
  "cs",
  "pl",
  "sk",
  "sl",
  "hr",
  "et",
  "lv",
  "lt",
  "fr",
  "it",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const FALLBACK_LANGUAGE: SupportedLanguage = "en";

/** Endonyms shown in the language picker. */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  sv: "Svenska",
  en: "English",
  fi: "Suomi",
  da: "Dansk",
  de: "Deutsch",
  cs: "Čeština",
  pl: "Polski",
  sk: "Slovenčina",
  sl: "Slovenščina",
  hr: "Hrvatski",
  et: "Eesti",
  lv: "Latviešu",
  lt: "Lietuvių",
  fr: "Français",
  it: "Italiano",
};

/** Region used for formatting when the user's country is unknown. */
export const LANGUAGE_DEFAULT_REGION: Record<SupportedLanguage, string> = {
  sv: "SE",
  en: "GB",
  fi: "FI",
  da: "DK",
  de: "DE",
  cs: "CZ",
  pl: "PL",
  sk: "SK",
  sl: "SI",
  hr: "HR",
  et: "EE",
  lv: "LV",
  lt: "LT",
  fr: "FR",
  it: "IT",
};

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return (
    typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

export function normaliseLanguage(value?: string | null): SupportedLanguage {
  const base = (value ?? "").slice(0, 2).toLowerCase();
  return isSupportedLanguage(base) ? base : FALLBACK_LANGUAGE;
}

/**
 * BCP47 locale for Intl formatting: chosen language + the user's country when
 * known (de-CH keeps German text with Swiss number formatting).
 */
export function resolveLocale(
  language: SupportedLanguage,
  countryCode?: string | null,
): string {
  const region = (countryCode ?? "").toUpperCase() || LANGUAGE_DEFAULT_REGION[language];
  return `${language}-${region}`;
}
