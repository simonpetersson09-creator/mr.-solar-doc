/**
 * Currency hardening: every country must resolve to its own ISO 4217 currency
 * through the whole app chain (market config -> economics defaults -> engine
 * result -> result page / PDF / snapshot). No generic EUR fallback is allowed
 * for a country with its own currency.
 */
import { describe, expect, it } from "vitest";
import { CURRENCY_BY_COUNTRY, currencyForCountryCode } from "@/config/currencies";
import { MARKETS } from "@/config/markets";
import {
  currencyForCountry,
  getCurrencyCode,
  resolveEconomicsDefaults,
  getCountryConfig,
} from "@/config/countries";
import { runCalculation } from "@/lib/calc/engine";
import type { CalculationOutcome } from "@/lib/calc/types";

const REQUIRED: Record<string, string> = {
  IS: "ISK",
  HU: "HUF",
  RO: "RON",
  RS: "RSD",
  TR: "TRY",
  AL: "ALL",
  BA: "BAM",
  MK: "MKD",
  NZ: "NZD",
  IL: "ILS",
  MX: "MXN",
  NO: "NOK",
  US: "USD",
  CA: "CAD",
  JP: "JPY",
  GB: "GBP",
  CH: "CHF",
  PL: "PLN",
  CZ: "CZK",
  DK: "DKK",
  SE: "SEK",
};

const MONTHLY_YIELD = [15, 35, 75, 110, 135, 140, 135, 110, 70, 40, 18, 12];

function runForCountry(countryCode: string): CalculationOutcome {
  const economics = resolveEconomicsDefaults(countryCode);
  return runCalculation({
    location: { latitude: 55, longitude: 12, countryCode, address: "Test", region: null } as never,
    resource: {
      annualKwhPerKwp: MONTHLY_YIELD.reduce((a, b) => a + b, 0),
      monthlyKwhPerKwp: MONTHLY_YIELD,
      orientation: "south",
      tiltDegrees: 30,
      orientationAssumed: false,
      tiltAssumed: false,
    } as never,
    consumption: { annualKwh: 18000, monthlyKwh: Array.from({ length: 12 }, () => 1500) },
    electrical: {
      maxAcPowerKw: 17,
      connection: { inputType: "amperage", amperes: 25 },
      pvPowerLimitKw: 17,
      pvLimitBinding: "connection",
      pvRulesStatus: "generic",
      gridProfileStatus: "verified",
      gridProfileConfirmed: true,
    } as never,
    economics: {
      selfConsumedValuePerKwh: economics.selfConsumedValuePerKwh,
      exportValuePerKwh: economics.exportValuePerKwh,
      installationCostPerKwp: economics.installationCostPerKwp,
      gridCompensationPerKwh: economics.gridCompensationPerKwh,
      gridCompensationEnabled: getCountryConfig(countryCode).economics.gridCompensation.enabled,
      currency: economics.currencyCode,
      valuesMissing: economics.valuesMissing,
    },
    selfConsumptionShare: 0.4,
    acceptedPaybackYears: 12,
    annualPriceChangeRate: 0.02,
    inverterSizesKw: [3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50],
  });
}

describe("currency hardening", () => {
  it("resolves the required special cases to their own currency", () => {
    for (const [country, currency] of Object.entries(REQUIRED)) {
      expect(getCurrencyCode(country), country).toBe(currency);
      expect(currencyForCountry(country), country).toBe(currency);
      expect(resolveEconomicsDefaults(country).currencyCode, country).toBe(currency);
    }
  });

  it("matches the central table for every mapped country", () => {
    for (const [country, currency] of Object.entries(CURRENCY_BY_COUNTRY)) {
      expect(getCurrencyCode(country), country).toBe(currency);
      expect(currencyForCountryCode(country), country).toBe(currency);
    }
  });

  it("never applies EUR to a country whose currency is not EUR", () => {
    for (const country of Object.keys(CURRENCY_BY_COUNTRY)) {
      const resolved = getCurrencyCode(country);
      if (CURRENCY_BY_COUNTRY[country] !== "EUR") expect(resolved, country).not.toBe("EUR");
    }
  });

  it("keeps market configs in sync with the central currency table", () => {
    for (const [country, market] of Object.entries(MARKETS)) {
      expect(market.currency, country).toBe(CURRENCY_BY_COUNTRY[country]);
    }
  });

  it("switches currency in both directions on country change", () => {
    const transitions: Array<[string, string]> = [
      ["DE", "NO"],
      ["NO", "DE"],
      ["SE", "US"],
      ["FR", "JP"],
      ["JP", "FR"],
      ["PL", "SK"],
    ];
    for (const [from, to] of transitions) {
      const before = resolveEconomicsDefaults(from).currencyCode;
      const after = resolveEconomicsDefaults(to).currencyCode;
      expect(before).toBe(CURRENCY_BY_COUNTRY[from]);
      expect(after).toBe(CURRENCY_BY_COUNTRY[to]);
      expect(after).not.toBe(before);
    }
  });

  it("carries the country currency into the calculation result (result page, PDF, snapshot)", () => {
    for (const country of ["SE", "NO", "JP", "US", "IS", "HU", "TR", "IL", "DE"]) {
      const outcome = runForCountry(country);
      expect(outcome.ok, country).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.result.economics.currency, country).toBe(CURRENCY_BY_COUNTRY[country]);
    }
  });

  it("does not prefill any Swedish installation cost", () => {
    expect(resolveEconomicsDefaults("SE").installationCostPerKwp).toBeNull();
    expect(getCountryConfig("SE").economics.installation.defaultCostPerKwp.value).toBeNull();
    for (const country of Object.keys(MARKETS)) {
      expect(resolveEconomicsDefaults(country).installationCostPerKwp, country).toBeNull();
    }
  });
});
