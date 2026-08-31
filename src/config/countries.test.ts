import { describe, expect, it } from "vitest";
import {
  calculateIncentives,
  getCountryConfig,
  getCurrencyCode,
  isGridCompensationAvailable,
  resolveEconomicsDefaults,
} from "./countries";
import { formatCurrency, formatDecimal } from "@/lib/format";
import { formatPricePerKwh } from "@/lib/units";

describe("country economics config", () => {
  it("takes SEK for Sweden from the country config", () => {
    expect(getCurrencyCode("SE")).toBe("SEK");
    expect(getCountryConfig("SE").economics.hasVerifiedDefaults).toBe(true);
  });

  it("uses EUR for euro countries", () => {
    expect(getCurrencyCode("DE")).toBe("EUR");
    expect(formatCurrency(2000, "de-DE", getCurrencyCode("DE"))).toContain("EUR");
  });

  it("only enables grid compensation where it exists", () => {
    expect(isGridCompensationAvailable("SE")).toBe(true);
    expect(isGridCompensationAvailable("DE")).toBe(false);
    // Not available -> never resolved into the calculation.
    expect(resolveEconomicsDefaults("DE").gridCompensationPerKwh).toBeNull();
    // Even a user value cannot activate a component the country does not have.
    expect(
      resolveEconomicsDefaults("DE", { gridCompensationPerKwh: 0.05 }).gridCompensationPerKwh,
    ).toBeNull();
    expect(
      resolveEconomicsDefaults("SE", { gridCompensationPerKwh: 0.05 }).gridCompensationPerKwh,
    ).toBe(0.05);
  });

  it("never lends Swedish prices to a country without verified defaults", () => {
    const config = getCountryConfig("BR");
    expect(config.economics.hasVerifiedDefaults).toBe(false);
    expect(config.economics.electricity.selfConsumedValuePerKwh.value).toBeNull();
    expect(config.economics.electricity.selfConsumedValuePerKwh.origin).toBe("missing");

    const resolved = resolveEconomicsDefaults("BR");
    expect(resolved.selfConsumedValuePerKwh).toBeNull();
    expect(resolved.exportValuePerKwh).toBeNull();
    expect(resolved.valuesMissing).toBe(true);
    const swedish = resolveEconomicsDefaults("SE");
    expect(resolved.selfConsumedValuePerKwh).not.toBe(swedish.selfConsumedValuePerKwh);
  });

  it("lets the user's own prices win over the country default", () => {
    const resolved = resolveEconomicsDefaults("SE", { selfConsumedValuePerKwh: 2.4 });
    expect(resolved.selfConsumedValuePerKwh).toBe(2.4);
    expect(resolved.valuesMissing).toBe(false);
  });

  it("keeps installation cost per kWp country specific", () => {
    expect(resolveEconomicsDefaults("SE").installationCostPerKwp).toBe(15000);
    expect(resolveEconomicsDefaults("BR").installationCostPerKwp).toBeNull();
  });

  it("applies no incentives until a rule is explicitly enabled", () => {
    expect(
      calculateIncentives({ countryCode: "SE", investmentAmount: 100000, installedKwp: 10 }),
    ).toEqual({ totalAmount: 0, applied: [] });
  });
});

describe("locale vs country", () => {
  it("formats numbers per locale", () => {
    expect(formatDecimal(12.5, "sv-SE", 1)).toBe("12,5");
    expect(formatDecimal(12.5, "en-GB", 1)).toBe("12.5");
    expect(formatDecimal(12.5, "de-DE", 1)).toBe("12,5");
  });

  it("formats currency from the currency code, not the language", () => {
    const swedishRules = getCurrencyCode("SE");
    const english = formatCurrency(25000, "en-GB", swedishRules);
    const swedish = formatCurrency(25000, "sv-SE", swedishRules);
    expect(english).toContain("SEK");
    expect(swedish).toContain("SEK");
    expect(english).not.toBe(swedish);
  });

  it("keeps economic rules unchanged when the UI language differs", () => {
    const ctxEnglish = { locale: "en-GB", currency: getCurrencyCode("SE") };
    const ctxSwedish = { locale: "sv-SE", currency: getCurrencyCode("SE") };
    const price = resolveEconomicsDefaults("SE").selfConsumedValuePerKwh!;
    expect(formatPricePerKwh(price, ctxEnglish)).toContain("SEK");
    expect(formatPricePerKwh(price, ctxSwedish)).toContain("SEK");
    // Same country -> same numbers regardless of locale.
    expect(resolveEconomicsDefaults("SE")).toEqual(resolveEconomicsDefaults("SE"));
    expect(ctxEnglish.currency).toBe(ctxSwedish.currency);
  });
});

describe("currency coverage for every launch and roadmap country", () => {
  it("maps the countries that previously fell back to a neutral code", () => {
    expect(getCurrencyCode("BR")).toBe("BRL");
    expect(getCurrencyCode("IN")).toBe("INR");
    expect(getCurrencyCode("ZA")).toBe("ZAR");
  });

  it("never renders the neutral XXX placeholder for a known country", () => {
    for (const code of ["BR", "IN", "ZA", "US", "CA", "JP", "SE", "DE"] as const) {
      const currency = getCurrencyCode(code);
      expect(currency).not.toBe("XXX");
      expect(currency).toMatch(/^[A-Z]{3}$/);
      expect(formatCurrency(1234, "en-US", currency)).toContain(currency);
    }
  });
});

describe("ISO currencies for the random global fallback markets", () => {
  const expected = {
    MX: "MXN", CL: "CLP", TH: "THB", KE: "KES",
    TR: "TRY", ID: "IDR", AR: "ARS",
    NO: "NOK", NZ: "NZD", PL: "PLN",
  } as const;

  it("maps every audited country to its ISO code", () => {
    for (const [country, currency] of Object.entries(expected)) {
      expect(getCurrencyCode(country)).toBe(currency);
    }
  });

  it("adds no economic defaults for the newly mapped countries", () => {
    for (const country of ["MX", "CL", "TH", "KE", "TR", "ID", "AR"] as const) {
      const economics = resolveEconomicsDefaults(country, {});
      expect(economics.selfConsumedValuePerKwh).toBeNull();
      expect(economics.exportValuePerKwh).toBeNull();
      expect(economics.valuesMissing).toBe(true);
    }
  });

  it("keeps the neutral fallback for an unknown country", () => {
    expect(getCurrencyCode("ZZ")).toBe("XXX");
    expect(getCurrencyCode(null)).toBe("XXX");
  });
});
