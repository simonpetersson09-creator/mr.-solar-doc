import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { FALLBACK_LANGUAGE, type SupportedLanguage } from "@/i18n/languages";
import { resolveRequestLanguage } from "@/i18n/request-language";

/**
 * The language the server must render the first HTML in. Server render and
 * first client render then agree, so there is no hydration mismatch and no
 * visible English flash.
 */
export const getRequestLanguage = createServerFn({ method: "GET" }).handler(
  async (): Promise<SupportedLanguage> => {
    try {
      const headers = getRequest().headers;
      return resolveRequestLanguage({
        cookie: headers.get("cookie"),
        acceptLanguage: headers.get("accept-language"),
      });
    } catch {
      return FALLBACK_LANGUAGE;
    }
  },
);
