import { describe, expect, it } from "vitest";
import { ACTIVE_MARKET_CODES, getCurrencyForCountry } from "@/config/markets";
import { formatCurrency } from "@/lib/format";
import { pdfText } from "@/services/solar-report-service";

const EXPECTED: Record<string, string> = {
  SE: "SEK",
  FI: "EUR",
  DK: "DKK",
  DE: "EUR",
  AT: "EUR",
  CZ: "CZK",
  PL: "PLN",
  SK: "EUR",
  SI: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",
  CH: "CHF",
};

describe("currency across the app", () => {
  it("uses the country currency for every active market", () => {
    for (const code of ACTIVE_MARKET_CODES) {
      expect(getCurrencyForCountry(code)).toBe(EXPECTED[code]);
    }
  });

  it("keeps the currency country-driven even when the language differs", () => {
    expect(formatCurrency(1000, "sv-SE", getCurrencyForCountry("PL"))).toContain("PLN");
    expect(formatCurrency(1000, "de-DE", getCurrencyForCountry("CH"))).toContain("CHF");
  });

  it("renders PDF-safe currency text for Central European locales", () => {
    const pln = pdfText(formatCurrency(1000, "pl-PL", "PLN"));
    const czk = pdfText(formatCurrency(1000, "cs-CZ", "CZK"));
    expect(pln).toContain("zl");
    expect(czk).toContain("Kc");
    for (const value of [pln, czk, pdfText(formatCurrency(1000, "de-DE", "EUR"))]) {
      // The euro sign is the one non-Latin-1 glyph jsPDF's WinAnsi fonts cover.
      expect(/[^\u0000-\u00ff\u20ac]/.test(value)).toBe(false);
    }
  });
});
