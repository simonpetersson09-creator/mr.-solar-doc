import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_CURRENCY_COUNTRIES,
  CURRENCY_BY_COUNTRY,
  currencyForCountryCode,
  NEUTRAL_CURRENCY_CODE,
} from "./currencies";
import { currencyForCountry, resolveEconomicsDefaults } from "./countries";

const EXPECTED: Record<string, string> = {
  SE: "SEK", NO: "NOK", DK: "DKK", FI: "EUR",
  DE: "EUR", FR: "EUR", NL: "EUR", BE: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", AT: "EUR", IE: "EUR",
  GB: "GBP", CH: "CHF", PL: "PLN",
  US: "USD", CA: "CAD", MX: "MXN",
  BR: "BRL", CL: "CLP", AR: "ARS",
  AU: "AUD", NZ: "NZD",
  JP: "JPY", IN: "INR", TH: "THB", ID: "IDR",
  ZA: "ZAR", KE: "KES", TR: "TRY",
};

describe("global currency mapping", () => {
  it.each(Object.entries(EXPECTED))("%s -> %s", (country, currency) => {
    expect(currencyForCountryCode(country)).toBe(currency);
    expect(currencyForCountry(country)).toBe(currency);
  });

  it("maps euro-using states outside the classic euro area", () => {
    expect(currencyForCountryCode("ME")).toBe("EUR"); // Montenegro
    expect(currencyForCountryCode("XK")).toBe("EUR"); // Kosovo
    expect(currencyForCountryCode("AD")).toBe("EUR");
    expect(currencyForCountryCode("MC")).toBe("EUR");
    expect(currencyForCountryCode("HR")).toBe("EUR");
  });

  it("maps dollarised countries outside the US", () => {
    expect(currencyForCountryCode("EC")).toBe("USD");
    expect(currencyForCountryCode("SV")).toBe("USD");
    expect(currencyForCountryCode("PA")).toBe("USD");
    expect(currencyForCountryCode("TL")).toBe("USD");
  });

  it("maps territories to the currency actually billed there", () => {
    expect(currencyForCountryCode("GL")).toBe("DKK");
    expect(currencyForCountryCode("FO")).toBe("DKK");
    expect(currencyForCountryCode("GI")).toBe("GIP");
    expect(currencyForCountryCode("PR")).toBe("USD");
    expect(currencyForCountryCode("RE")).toBe("EUR");
    expect(currencyForCountryCode("NC")).toBe("XPF");
    expect(currencyForCountryCode("IM")).toBe("GBP");
  });

  it("reports genuine multi-currency cases as neutral instead of guessing", () => {
    expect(currencyForCountryCode("ZW")).toBe(NEUTRAL_CURRENCY_CODE);
    expect(AMBIGUOUS_CURRENCY_COUNTRIES["ZW"]).toBeTruthy();
    for (const code of Object.keys(AMBIGUOUS_CURRENCY_COUNTRIES)) {
      expect(currencyForCountryCode(code)).toBe(NEUTRAL_CURRENCY_CODE);
    }
  });

  it("uses XXX only for missing, invalid or unknown codes", () => {
    expect(currencyForCountryCode("ZZ")).toBe("XXX");
    expect(currencyForCountryCode(null)).toBe("XXX");
    expect(currencyForCountryCode(undefined)).toBe("XXX");
    expect(currencyForCountryCode("")).toBe("XXX");
    expect(currencyForCountryCode("SWE")).toBe("XXX");
    expect(currencyForCountry("ZZ")).toBe("XXX");
  });

  it("accepts lowercase and padded input", () => {
    expect(currencyForCountryCode("mx")).toBe("MXN");
    expect(currencyForCountryCode(" ke ")).toBe("KES");
  });

  it("only contains well-formed ISO codes", () => {
    for (const [country, currency] of Object.entries(CURRENCY_BY_COUNTRY)) {
      expect(country).toMatch(/^[A-Z]{2}$/);
      expect(currency).toMatch(/^[A-Z]{3}$/);
      expect(currency).not.toBe(NEUTRAL_CURRENCY_CODE);
      expect(AMBIGUOUS_CURRENCY_COUNTRIES[country as string]).toBeUndefined();
    }
  });

  it("never invents economic defaults from currency knowledge", () => {
    for (const country of ["KE", "AR", "TH", "ID", "CL", "EC"]) {
      const economics = resolveEconomicsDefaults(country);
      expect(economics.currencyCode).toBe(currencyForCountryCode(country));
      expect(economics.selfConsumedValuePerKwh).toBeNull();
      expect(economics.exportValuePerKwh).toBeNull();
      expect(economics.gridCompensationPerKwh).toBeNull();
      expect(economics.installationCostPerKwp).toBeNull();
      expect(economics.valuesMissing).toBe(true);
    }
  });

  it("formats every mapped currency through Intl without throwing", () => {
    for (const currency of new Set(Object.values(CURRENCY_BY_COUNTRY))) {
      for (const locale of ["sv-SE", "en-US"]) {
        const text = new Intl.NumberFormat(locale, { style: "currency", currency }).format(1234.5);
        expect(text).toBeTruthy();
      }
    }
  });
});
