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
  "es",
  "de",
  "fr",
  "pt",
  "it",
  "nl",
  "pl",
  "no",
  "da",
  "fi",
  "cs",
  "ro",
  "el",
  "hu",
  "sk",
  "sl",
  "hr",
  "sr",
  "bg",
  "uk",
  "tr",
  "hi",
  "id",
  "he",
  "lt",
  "et",
  "lv",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const FALLBACK_LANGUAGE: SupportedLanguage = "en";

/** Endonyms shown in the language picker. */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  sv: "Svenska",
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  pt: "Português",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  no: "Norsk",
  da: "Dansk",
  fi: "Suomi",
  cs: "Čeština",
  ro: "Română",
  el: "Ελληνικά",
  hu: "Magyar",
  sk: "Slovenčina",
  sl: "Slovenščina",
  hr: "Hrvatski",
  sr: "Српски",
  bg: "Български",
  uk: "Українська",
  tr: "Türkçe",
  hi: "हिन्दी",
  id: "Bahasa Indonesia",
  he: "עברית",
  lt: "Lietuvių",
  et: "Eesti",
  lv: "Latviešu",
};

/** Region used for formatting when the user's country is unknown. */
export const LANGUAGE_DEFAULT_REGION: Record<SupportedLanguage, string> = {
  sv: "SE",
  en: "GB",
  es: "ES",
  de: "DE",
  fr: "FR",
  pt: "PT",
  it: "IT",
  nl: "NL",
  pl: "PL",
  no: "NO",
  da: "DK",
  fi: "FI",
  cs: "CZ",
  ro: "RO",
  el: "GR",
  hu: "HU",
  sk: "SK",
  sl: "SI",
  hr: "HR",
  sr: "RS",
  bg: "BG",
  uk: "UA",
  tr: "TR",
  hi: "IN",
  id: "ID",
  he: "IL",
  lt: "LT",
  et: "EE",
  lv: "LV",
};

/** Languages written right-to-left. Used to set `dir` on the document. */
export const RTL_LANGUAGES: readonly SupportedLanguage[] = ["he"];

export function isRtlLanguage(language: SupportedLanguage): boolean {
  return RTL_LANGUAGES.includes(language);
}


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
