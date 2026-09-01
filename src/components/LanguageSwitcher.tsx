import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LANGUAGE_DEFAULT_REGION,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  normaliseLanguage,
} from "@/i18n/languages";
import { updateSettings } from "@/services/settings-service";
import { useAppLocale } from "@/hooks/use-app-locale";
import { getMarketConfig } from "@/config/markets";
import { useWizardStore } from "@/state/wizard-store";

/**
 * Manual language selection. Currency is never affected — it follows the
 * country from the address.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const { language } = useAppLocale();
  const countryCode = useWizardStore((s) => s.location?.countryCode ?? null);
  const market = countryCode ? getMarketConfig(countryCode) : null;

  // Markets with several official languages surface only those; otherwise the
  // full catalogue is available so anyone can read the app in their language.
  const options =
    market && market.languageOptions.length > 1
      ? Array.from(new Set([...market.languageOptions, ...SUPPORTED_LANGUAGES]))
      : SUPPORTED_LANGUAGES;

  return (
    <Select
      value={language}
      onValueChange={(value) => {
        const next = normaliseLanguage(value);
        updateSettings({ language: next, languageChosenManually: true });
        void i18n.changeLanguage(next);
      }}
    >
      <SelectTrigger
        aria-label={t("settings.language")}
        className={className ?? "h-9 w-auto gap-2 border-border bg-card px-3 text-xs"}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((lang) => (
          <SelectItem key={lang} value={lang} className="text-sm">
            <span className="flex items-center gap-2">
              <span aria-hidden className="text-base leading-none">
                {languageFlagEmoji(lang)}
              </span>
              {LANGUAGE_NAMES[lang]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
