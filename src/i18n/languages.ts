/**
 * Language catalogue. `language` (UI text), `locale` (formatting), `country`
 * (market rules) and `currency` are deliberately independent concepts.
 *
 * A language in this list does NOT imply a supported market (see
 * ACTIVE_MARKET_CODES in src/config/markets.ts, pinned by markets.test.ts).
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

/** Regional-indicator flag emoji for an ISO 3166-1 alpha-2 country code. */
export function countryFlagEmoji(countryCode: string): string {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Flag shown next to a language in the picker. */
export function languageFlagEmoji(language: SupportedLanguage): string {
  return countryFlagEmoji(LANGUAGE_DEFAULT_REGION[language]);
}
