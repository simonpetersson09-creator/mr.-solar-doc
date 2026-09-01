import { describe, expect, it } from "vitest";
import { getCountryConfig, resolveEconomicsDefaults } from "./countries";
import { currencyForCountry } from "./countries";
import { ELECTRICITY_PRICE_DEFAULTS } from "./electricity-price-defaults";

/** [countryCode, currency, purchased price, estimated export price] */
const EXPECTED: Array<[string, string, number, number]> = [
  ["SE", "SEK", 1.5, 0.5],
  ["FI", "EUR", 0.18, 0.05],
  ["DK", "DKK", 2.8, 0.35],
  ["DE", "EUR", 0.35, 0.08],
  ["AT", "EUR", 0.35, 0.06],
  ["CZ", "CZK", 7.5, 1.3],
  ["PL", "PLN", 0.95, 0.25],
  ["SK", "EUR", 0.2, 0.05],
  ["SI", "EUR", 0.2, 0.05],
  ["EE", "EUR", 0.23, 0.05],
  ["LV", "EUR", 0.24, 0.05],
  ["LT", "EUR", 0.24, 0.05],
  ["CH", "CHF", 0.31, 0.07],
  ["NO", "NOK", 1.95, 0.5],
  ["NL", "EUR", 0.28, 0.08],
  ["GB", "GBP", 0.3, 0.08],
  ["BE", "EUR", 0.35, 0.06],
  ["FR", "EUR", 0.24, 0.04],
  ["PT", "EUR", 0.22, 0.06],
  ["ES", "EUR", 0.23, 0.06],
  ["IT", "EUR", 0.35, 0.07],
  ["IE", "EUR", 0.38, 0.15],
  ["HR", "EUR", 0.16, 0.06],
  ["HU", "HUF", 40, 15],
  ["RO", "RON", 0.95, 0.25],
  ["GR", "EUR", 0.22, 0.07],
  ["BG", "EUR", 0.14, 0.05],
  ["RS", "RSD", 14, 5],
  ["TR", "TRY", 2.8, 1.2],
  ["IS", "ISK", 23, 8],
  ["LU", "EUR", 0.23, 0.08],
  ["MT", "EUR", 0.13, 0.1],
  ["CY", "EUR", 0.3, 0.1],
  ["MK", "MKD", 7.0, 3.0],
  ["AL", "ALL", 10, 5],
  ["BA", "BAM", 0.18, 0.08],
  ["ME", "EUR", 0.11, 0.05],
  ["NZ", "NZD", 0.38, 0.13],
  ["IL", "ILS", 0.67, 0.2],
  ["MX", "MXN", 1.9, 0.8],
  ["US", "USD", 0.18, 0.07],
  ["CA", "CAD", 0.17, 0.07],
  ["JP", "JPY", 35, 16],
];

describe("electricity price defaults", () => {
  it("covers exactly the 43 verified countries", () => {
    expect(EXPECTED).toHaveLength(43);
    expect(Object.keys(ELECTRICITY_PRICE_DEFAULTS).sort()).toEqual(
      EXPECTED.map(([code]) => code).sort(),
    );
  });

  it.each(EXPECTED)("%s resolves defaults in %s", (code, currency, self, exported) => {
    const economics = getCountryConfig(code).economics;
    expect(economics.currencyCode).toBe(currency);
    expect(currencyForCountry(code)).toBe(currency);
    expect(economics.electricity.selfConsumedValuePerKwh.value).toBeCloseTo(self, 6);
    expect(economics.electricity.exportPricePerKwh.value).toBeCloseTo(exported, 6);
    expect(economics.hasVerifiedDefaults).toBe(true);

    const resolved = resolveEconomicsDefaults(code);
    expect(resolved.currencyCode).toBe(currency);
    expect(resolved.selfConsumedValuePerKwh).toBeCloseTo(self, 6);
    expect(resolved.exportValuePerKwh).toBeCloseTo(exported, 6);
    expect(resolved.valuesMissing).toBe(false);
  });

  it("keeps other countries on the fallback with no prefilled prices", () => {
    for (const code of ["BR", "ZA", "AU", "IN", "KE"]) {
      const resolved = resolveEconomicsDefaults(code);
      expect(resolved.selfConsumedValuePerKwh).toBeNull();
      expect(resolved.exportValuePerKwh).toBeNull();
      expect(resolved.valuesMissing).toBe(true);
    }
  });

  it("lets the user override a default without touching the currency", () => {
    const resolved = resolveEconomicsDefaults("DE", {
      selfConsumedValuePerKwh: 0.5,
      exportValuePerKwh: 0.02,
    });
    expect(resolved.currencyCode).toBe("EUR");
    expect(resolved.selfConsumedValuePerKwh).toBe(0.5);
    expect(resolved.exportValuePerKwh).toBe(0.02);
  });

  it("switches defaults and currency when the country changes", () => {
    const se = resolveEconomicsDefaults("SE");
    const jp = resolveEconomicsDefaults("JP");
    expect(se.currencyCode).toBe("SEK");
    expect(jp.currencyCode).toBe("JPY");
    expect(jp.selfConsumedValuePerKwh).toBe(35);
  });
});
