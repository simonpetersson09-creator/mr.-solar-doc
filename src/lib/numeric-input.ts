/**
 * The ONE numeric input layer for human-typed values.
 *
 * Two responsibilities are kept strictly apart:
 *
 *   display string  — exactly what the user typed, including transient states
 *                     like "", "-", "0,", "1.", "1 234," …
 *   parsed value    — a real JavaScript number, produced only when the string
 *                     is a complete number
 *
 * A controlled React input must never coerce the display string through
 * `Number()` on every keystroke: that is what makes fields jump to 0, swallow
 * the decimal separator or reorder digits. Components therefore hold the
 * string, and commit the parsed value on blur / when a complete value exists.
 *
 * All parsing goes through `parseLocaleNumber` (see src/lib/format.ts) so the
 * separator rules are documented in exactly one place.
 */

import { parseLocaleNumber } from "@/lib/format";

/** Whitespace-like characters that only ever act as group separators. */
const GROUP_CHARS = "\\s\\u00a0\\u202f\\u2009\\u2007'\u2019";

export interface NumericInputOptions {
  /** Allow a leading minus sign. Default false: physical quantities are >= 0. */
  allowNegative?: boolean;
  /** Allow a decimal separator. Default true. */
  allowDecimal?: boolean;
  /** Active UI locale, used only to resolve ambiguous inputs like "1.234". */
  locale?: string | null;
  /** Inclusive lower bound applied on commit. */
  min?: number;
  /** Inclusive upper bound applied on commit. */
  max?: number;
}

export type NumericInputStatus = "empty" | "incomplete" | "invalid" | "ok";

export interface NumericInputResult {
  /** The parsed number, or null when the string is not a complete number. */
  value: number | null;
  status: NumericInputStatus;
  /** True when the parsed value had to be clamped into [min, max]. */
  clamped: boolean;
}

/**
 * Removes characters that can never be part of a number, while KEEPING every
 * character a partially typed number may legitimately contain (digits, "." ",",
 * spaces/NBSP as group separators, and "-" when negatives are allowed).
 */
export function sanitizeNumericInput(raw: string, options: NumericInputOptions = {}): string {
  const { allowNegative = false, allowDecimal = true } = options;
  const decimals = allowDecimal ? ".," : "";
  const allowed = new RegExp(`[^0-9${decimals}${GROUP_CHARS}${allowNegative ? "-" : ""}]`, "g");
  let cleaned = raw.replace(allowed, "");
  if (allowNegative) {
    // At most one minus, and only in front.
    const negative = cleaned.trimStart().startsWith("-");
    cleaned = (negative ? "-" : "") + cleaned.replace(/-/g, "");
  }
  return cleaned;
}

/**
 * True for strings the user is still in the middle of typing: empty, a lone
 * sign, or a value ending in a separator ("0,", "1.", "1 234,").
 */
export function isIncompleteNumericInput(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "+") return true;
  return /[.,]$/.test(trimmed);
}

/** Parses one field value. Never throws, never guesses a value for garbage. */
export function parseNumericInput(
  raw: string,
  options: NumericInputOptions = {},
): NumericInputResult {
  const { allowNegative = false, locale = null, min, max } = options;
  const text = raw.trim();
  if (text === "") return { value: null, status: "empty", clamped: false };
  // A value the user is still typing is never a committed number, even though
  // the parser can already read it ("0," would otherwise commit 0).
  if (isIncompleteNumericInput(text)) return { value: null, status: "incomplete", clamped: false };

  const parsed = parseLocaleNumber(text, locale);
  if (parsed === null) {
    return {
      value: null,
      status: isIncompleteNumericInput(text) ? "incomplete" : "invalid",
      clamped: false,
    };
  }
  if (!Number.isFinite(parsed)) return { value: null, status: "invalid", clamped: false };
  if (parsed < 0 && !allowNegative) return { value: null, status: "invalid", clamped: false };

  let value = parsed;
  let clamped = false;
  if (typeof min === "number" && value < min) {
    value = min;
    clamped = true;
  }
  if (typeof max === "number" && value > max) {
    value = max;
    clamped = true;
  }
  return { value, status: "ok", clamped };
}

/**
 * The string shown in the field after a commit. Uses the locale's decimal
 * separator but NO group separators, so re-editing the value is unambiguous.
 */
export function formatNumericForEdit(
  value: number | null,
  locale?: string | null,
  maximumFractionDigits = 4,
): string {
  if (value === null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat(locale ?? "en", {
    useGrouping: false,
    maximumFractionDigits,
  }).format(value);
}
