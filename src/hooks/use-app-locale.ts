import { useTranslation } from "react-i18next";
import { LANGUAGE_LOCALE, type SupportedLanguage } from "@/i18n";

/** Single source of truth for the active locale used in all formatting. */
export function useAppLocale(): { locale: string; language: SupportedLanguage } {
  const { i18n } = useTranslation();
  const language = (i18n.language?.slice(0, 2) as SupportedLanguage) ?? "sv";
  return {
    language,
    locale: LANGUAGE_LOCALE[language] ?? LANGUAGE_LOCALE.sv,
  };
}
