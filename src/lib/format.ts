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

/** Money with decimals, for per-kWh prices ("0,37 SEK"). */
export function formatCurrencyPrecise(
  value: number,
  locale: string,
  currency: string,
  digits = 2,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
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
 * Characters that can only ever be group separators in human input:
 * ordinary space, NBSP, narrow NBSP, thin space and the Swiss apostrophe.
 */
const GROUP_ONLY_CHARS = /[\s\u00a0\u202f\u2009\u2007'\u2019\u00b4`]/g;

/** The decimal separator the given locale uses (".", or ","). */
export function decimalSeparatorFor(locale?: string | null): "." | "," {
  if (!locale) return ".";
  try {
    const part = new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((p) => p.type === "decimal")?.value;
    return part === "," ? "," : ".";
  } catch {
    return ".";
  }
}

/**
 * Parses a number typed by a human, locale-aware and deterministic.
 *
 * DOCUMENTED STRATEGY
 *  1. Whitespace (space, NBSP, narrow NBSP) and the Swiss apostrophe are
 *     always group separators and are removed first.
 *  2. Only digits, "." and "," may remain; anything else returns null.
 *  3. When BOTH "." and "," occur, the LAST of them is the decimal separator
 *     and the other one is a group separator: "1.234,5" and "1,234.5" both
 *     parse to 1234.5.
 *  4. When only one of them occurs several times it is a group separator:
 *     "1.234.567" -> 1234567.
 *  5. AMBIGUOUS CASE — a single separator followed by exactly three digits
 *     ("1,234" / "1.234") is resolved by the active locale: the locale's own
 *     decimal separator is read as a decimal separator, the other character
 *     as a group separator. WITHOUT a locale both are read as a thousands
 *     group ("1.234" -> 1234, "1,234" -> 1234) — a deterministic rule chosen
 *     so an unknown locale can never turn 1234 into 1.234 (a 1000x error).
 *  5b. Grouping must be consistent: one separator character, groups of three.
 *     "1,2,3" is rejected instead of being glued into 123.
 *  6. A trailing separator is kept as an incomplete decimal ("12," -> 12), so
 *     a controlled input never fights the user mid-typing.
 *  7. Empty, sign-only and non-numeric input returns null — never 0 — so
 *     callers can tell "nothing entered" from "zero".
 *
 * Every user-entered physical quantity (price, kWh, A, kW, kVA, V) must go
 * through this one function.
 */
export function parseLocaleNumber(raw: string, locale?: string | null): number | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(GROUP_ONLY_CHARS, "");
  if (s === "") return null;

  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimalIndex = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalIndex = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const index = lastDot >= 0 ? lastDot : lastComma;
    const occurrences = s.split(sep).length - 1;
    const digitsAfter = s.length - index - 1;
    if (occurrences > 1) {
      decimalIndex = -1;
    } else if (digitsAfter === 3 && index > 0) {
      // AMBIGUOUS: "1.234" / "1,234". With a locale, its own decimal
      // separator decides. Without one, three trailing digits are read as a
      // thousands group — guessing "decimal" here would risk a 1000x error.
      decimalIndex = locale && sep === decimalSeparatorFor(locale) ? index : -1;
    } else {
      decimalIndex = index;
    }
  }

  const integerRaw = decimalIndex >= 0 ? s.slice(0, decimalIndex) : s;
  const fraction = decimalIndex >= 0 ? s.slice(decimalIndex + 1) : "";
  if (/[.,]/.test(fraction)) return null;

  // The integer part may only contain CONSISTENT grouping: one separator
  // character, in groups of three ("1,234,567"). Anything else ("1,2,3") is
  // not a number a human meant, and must not be silently glued together.
  if (/[.,]/.test(integerRaw)) {
    const groupChar = integerRaw.includes(".") ? "." : ",";
    const other = groupChar === "." ? "," : ".";
    if (integerRaw.includes(other)) return null;
    const pattern = new RegExp(`^[0-9]{1,3}(\\${groupChar}[0-9]{3})+$`);
    if (!pattern.test(integerRaw)) return null;
  }
  const integer = integerRaw.replace(/[.,]/g, "");
  if (integer === "" && fraction === "") return null;

  const parsed = Number(`${integer === "" ? "0" : integer}.${fraction === "" ? "0" : fraction}`);
  return Number.isFinite(parsed) ? sign * parsed : null;
}

