/** Locale-aware formatting. Active locale drives numbers, decimals and currency. */

export function formatNumber(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    ...options,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDecimal(value: number, locale: string, digits = 1): string {
  return formatNumber(value, locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Money is always shown with the ISO 4217 code (e.g. "12 345 SEK"). Locale
 * symbols are avoided on purpose: `en-SE` would otherwise render SEK as "kr",
 * which is wrong for a non-Swedish reader. Digits stay locale-aware.
 */
export function formatCurrency(value: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(share: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(share) ? share : 0);
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));
}

export function isoDateOnly(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Parses a number typed by a human. Accepts both "1.5" and "1,5" (comma is the
 * decimal separator on most European keyboards) plus space/NBSP thousands
 * separators. Returns `null` for empty or non-numeric input instead of 0, so
 * callers can tell "nothing entered" apart from "zero".
 */
export function parseLocaleNumber(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, ".");
  if (cleaned === "" || cleaned === "." || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
