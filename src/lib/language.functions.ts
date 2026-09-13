import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_COOKIE,
  isSupportedLanguage,
  normaliseLanguage,
  type SupportedLanguage,
} from "@/i18n/languages";

function fromCookie(header: string | null): SupportedLanguage | null {
  if (!header) return null;
  const match = new RegExp(`(?:^|;\\s*)${LANGUAGE_COOKIE}=([^;]+)`).exec(header);
  if (!match?.[1]) return null;
  const value = normaliseLanguage(decodeURIComponent(match[1]));
  return isSupportedLanguage(value) ? value : null;
}

function fromAcceptLanguage(header: string | null): SupportedLanguage | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (!tag) continue;
    const base = tag.split(/[-_]/)[0]?.toLowerCase() ?? "";
    if (isSupportedLanguage(base)) return base;
  }
  return null;
}

/**
 * The language the first HTML render must use: the saved cookie, otherwise the
 * browser's own preference, otherwise English. Server render and first client
 * render then agree, so there is no hydration mismatch and no visible flicker.
 */
export const getRequestLanguage = createServerFn({ method: "GET" }).handler(
  async (): Promise<SupportedLanguage> => {
    try {
      const headers = getRequest().headers;
      return (
        fromCookie(headers.get("cookie")) ??
        fromAcceptLanguage(headers.get("accept-language")) ??
        FALLBACK_LANGUAGE
      );
    } catch {
      return FALLBACK_LANGUAGE;
    }
  },
);
