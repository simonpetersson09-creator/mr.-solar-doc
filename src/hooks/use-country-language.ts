import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getMarketConfig } from "@/config/markets";
import { loadSettings, updateSettings } from "@/services/settings-service";
import { useWizardStore } from "@/state/wizard-store";
import { normaliseLanguage } from "@/i18n/languages";

/**
 * Country -> default language. Runs only until the user picks a language
 * manually; currency always stays country-driven and is untouched here.
 */
export function useCountryLanguage(): void {
  const { i18n } = useTranslation();
  const countryCode = useWizardStore((s) => s.location?.countryCode ?? null);

  useEffect(() => {
    if (!countryCode) return;
    if (loadSettings().languageChosenManually) return;
    const market = getMarketConfig(countryCode);
    // Multi-language markets (e.g. Switzerland) let the user choose instead.
    if (market.languageOptions.length > 1) return;
    const next = normaliseLanguage(market.defaultLanguage);
    if (normaliseLanguage(i18n.language) === next) return;
    updateSettings({ language: next });
    void i18n.changeLanguage(next);
  }, [countryCode, i18n]);
}
