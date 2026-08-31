import { useTranslation } from "react-i18next";
import { normaliseLanguage, resolveLocale, type SupportedLanguage } from "@/i18n/languages";
import { getCurrencyCode, NEUTRAL_CURRENCY_CODE } from "@/config/countries";
import { useWizardStore } from "@/state/wizard-store";

export interface AppLocale {
  /** UI language (user-selectable). */
  language: SupportedLanguage;
  /** Country from the chosen address (market rules, currency). "" when unknown. */
  countryCode: string;
  /** BCP47 locale for Intl formatting: language + country. */
  locale: string;
  /** ISO 4217 currency — decided by country only, never by language. */
  currency: string;
  /** True when the country is unknown and the neutral currency code is shown. */
  currencyUnknown: boolean;
}

/**
 * Single source of truth for language, locale and currency used everywhere.
 * Currency comes from the country layer only — the same function the
 * calculation engine and the PDF read — so UI and result can never diverge.
 */
export function useAppLocale(): AppLocale {
  const { i18n } = useTranslation();
  const countryCode = useWizardStore((s) => s.location?.countryCode ?? null);
  const language = normaliseLanguage(i18n.language);
  const code = (countryCode ?? "").toUpperCase();
  const currency = getCurrencyCode(code);

  return {
    language,
    countryCode: code,
    locale: resolveLocale(language, code || null),
    currency,
    currencyUnknown: currency === NEUTRAL_CURRENCY_CODE,
  };
}

