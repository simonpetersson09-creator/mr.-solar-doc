import { useTranslation } from "react-i18next";
import { normaliseLanguage, resolveLocale, type SupportedLanguage } from "@/i18n/languages";
import { getMarketConfig } from "@/config/markets";
import { useWizardStore } from "@/state/wizard-store";

export interface AppLocale {
  /** UI language (user-selectable). */
  language: SupportedLanguage;
  /** Country from the chosen address (market rules, currency). */
  countryCode: string;
  /** BCP47 locale for Intl formatting: language + country. */
  locale: string;
  /** ISO 4217 currency — decided by country only, never by language. */
  currency: string;
}

/** Single source of truth for language, locale and currency used everywhere. */
export function useAppLocale(): AppLocale {
  const { i18n } = useTranslation();
  const countryCode = useWizardStore((s) => s.location?.countryCode ?? null);
  const language = normaliseLanguage(i18n.language);
  const market = getMarketConfig(countryCode);

  return {
    language,
    countryCode: market.countryCode,
    locale: resolveLocale(language, countryCode),
    currency: market.currency,
  };
}
