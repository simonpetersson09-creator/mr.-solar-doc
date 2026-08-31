import { describe, expect, it } from "vitest";
import { parseLocaleNumber } from "@/lib/format";
import {
  formatNumericForEdit,
  isIncompleteNumericInput,
  parseNumericInput,
  sanitizeNumericInput,
} from "@/lib/numeric-input";

const NBSP = "\u00a0";
const NNBSP = "\u202f";

describe("parseLocaleNumber – separator conventions", () => {
  const cases: Array<[string, number]> = [
    ["1 234,5", 1234.5],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["1234.5", 1234.5],
    ["1234,5", 1234.5],
    ["0,25", 0.25],
    ["0.25", 0.25],
    ["12,50", 12.5],
    ["12.50", 12.5],
    ["1 234", 1234],
    [`1${NBSP}234,5`, 1234.5],
    [`1${NNBSP}234,5`, 1234.5],
    ["1'234.5", 1234.5],
    ["1.234.567", 1234567],
    ["1,234,567.25", 1234567.25],
    ["  42  ", 42],
    ["+7,5", 7.5],
  ];
  it.each(cases)("parses %s", (input, expected) => {
    expect(parseLocaleNumber(input)).toBeCloseTo(expected, 6);
  });

  it("uses the locale to resolve the ambiguous three-digit case", () => {
    // Swedish: comma is the decimal separator.
    expect(parseLocaleNumber("1,234", "sv-SE")).toBeCloseTo(1.234, 6);
    expect(parseLocaleNumber("1.234", "sv-SE")).toBe(1234);
    // US English: dot is the decimal separator.
    expect(parseLocaleNumber("1.234", "en-US")).toBeCloseTo(1.234, 6);
    expect(parseLocaleNumber("1,234", "en-US")).toBe(1234);
    // Without a locale, three trailing digits are a thousands group.
    expect(parseLocaleNumber("1,234")).toBe(1234);
    expect(parseLocaleNumber("1.234")).toBe(1234);
  });

  it("returns null – never 0 – for non-numbers", () => {
    for (const raw of ["", "   ", "abc", "-", ",", ".", "12 kr", "1,2,3.4.5", "€0.25"]) {
      expect(parseLocaleNumber(raw)).toBeNull();
    }
  });

  it("handles very large values and negatives", () => {
    expect(parseLocaleNumber("9 999 999 999,99")).toBeCloseTo(9999999999.99, 2);
    expect(parseLocaleNumber("-1 234,5")).toBeCloseTo(-1234.5, 6);
  });
});

describe("sanitizeNumericInput", () => {
  it("keeps transient typing states intact", () => {
    for (const raw of ["", "0,", "0.", "1,2", "1.", "1,234.", "1 234,"]) {
      expect(sanitizeNumericInput(raw)).toBe(raw);
    }
  });

  it("drops characters that can never be part of a number", () => {
    expect(sanitizeNumericInput("12 kr")).toBe("12 ");
    expect(sanitizeNumericInput("€0,25")).toBe("0,25");
    expect(sanitizeNumericInput("abc")).toBe("");
  });

  it("rejects the minus sign unless negatives are allowed", () => {
    expect(sanitizeNumericInput("-5")).toBe("5");
    expect(sanitizeNumericInput("-5", { allowNegative: true })).toBe("-5");
    expect(sanitizeNumericInput("5-5-", { allowNegative: true })).toBe("55");
  });
});

describe("parseNumericInput", () => {
  it("separates empty, incomplete, invalid and ok", () => {
    expect(parseNumericInput("").status).toBe("empty");
    expect(parseNumericInput("0,").status).toBe("incomplete");
    expect(parseNumericInput("abc").status).toBe("invalid");
    expect(parseNumericInput("0,25")).toMatchObject({ status: "ok", value: 0.25 });
  });

  it("rejects negatives where they are not allowed", () => {
    expect(parseNumericInput("-1").value).toBeNull();
    expect(parseNumericInput("-1", { allowNegative: true }).value).toBe(-1);
  });

  it("clamps into range and reports it", () => {
    expect(parseNumericInput("120", { min: 0, max: 90 })).toMatchObject({
      value: 90,
      clamped: true,
    });
  });

  it("copes with pasted, formatted values", () => {
    expect(parseNumericInput(`1${NBSP}234,50`, { locale: "sv-SE" }).value).toBeCloseTo(1234.5, 6);
    expect(parseNumericInput("1,234.50", { locale: "en-US" }).value).toBeCloseTo(1234.5, 6);
  });
});

describe("isIncompleteNumericInput / formatNumericForEdit", () => {
  it("detects transient states", () => {
    expect(isIncompleteNumericInput("")).toBe(true);
    expect(isIncompleteNumericInput("-")).toBe(true);
    expect(isIncompleteNumericInput("1,")).toBe(true);
    expect(isIncompleteNumericInput("1,5")).toBe(false);
  });

  it("writes back a re-editable, ungrouped string", () => {
    expect(formatNumericForEdit(1234.5, "sv-SE")).toBe("1234,5");
    expect(formatNumericForEdit(1234.5, "en-US")).toBe("1234.5");
    expect(formatNumericForEdit(null, "sv-SE")).toBe("");
  });
});
