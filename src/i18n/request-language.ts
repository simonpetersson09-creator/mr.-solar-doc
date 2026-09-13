import {
  FALLBACK_LANGUAGE,
  LANGUAGE_COOKIE,
  isSupportedLanguage,

  type SupportedLanguage,
} from "./languages";

function fromCookie(header: string | null): SupportedLanguage | null {
  if (!header) return null;
  const match = new RegExp(`(?:^|;\\s*)${LANGUAGE_COOKIE}=([^;]+)`).exec(header);
  if (!match?.[1]) return null;
  // Checked as-is: normaliseLanguage would silently turn an unsupported value
  // into English and hide the browser preference.
  const value = decodeURIComponent(match[1]).slice(0, 2).toLowerCase();
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
 * Language for the very first HTML render: the saved cookie wins, then the
 * browser's own preference, then English. Pure so it can be tested without a
 * request.
 */
export function resolveRequestLanguage(headers: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): SupportedLanguage {
  return (
    fromCookie(headers.cookie ?? null) ??
    fromAcceptLanguage(headers.acceptLanguage ?? null) ??
    FALLBACK_LANGUAGE
  );
}
