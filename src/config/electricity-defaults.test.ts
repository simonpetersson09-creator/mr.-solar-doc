import { describe, expect, it } from "vitest";
import {
  ACTIVE_MARKET_CODES,
  ELECTRICITY_PRICE_DEFAULTS_VERSION,
  MARKETS,
} from "./markets";
import { calculateSolarSystem } from "@/lib/calc/engine";
import type { CalculationInput } from "@/lib/calc/types";

/** Standard values ("schablonvärden"), currency, per active market. */
const EXPECTED: Record<string, { currency: string; self: number; export: number }> = {
  SE: { currency: "SEK", self: 1.5, export: 0.5 },
  FI: { currency: "EUR", self: 0.18, export: 0.05 },
  DK: { currency: "DKK", self: 2.8, export: 0.35 },
  DE: { currency: "EUR", self: 0.35, export: 0.08 },
  AT: { currency: "EUR", self: 0.35, export: 0.06 },
  CZ: { currency: "CZK", self: 7.5, export: 1.3 },
  PL: { currency: "PLN", self: 0.95, export: 0.25 },
  SK: { currency: "EUR", self: 0.2, export: 0.05 },
  SI: { currency: "EUR", self: 0.2, export: 0.05 },
  EE: { currency: "EUR", self: 0.23, export: 0.05 },
  LV: { currency: "EUR", self: 0.24, export: 0.05 },
  LT: { currency: "EUR", self: 0.24, export: 0.05 },
  CH: { currency: "CHF", self: 0.31, export: 0.07 },
};

function baseInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  const monthlyKwhPerKwp = [15, 30, 70, 110, 140, 150, 145, 120, 80, 45, 18, 10];
  return {
    location: {
      address: "Testgatan 1",
      latitude: 59.3,
      longitude: 18.1,
      countryCode: "SE",
      region: "Stockholm",
    },
    resource: {
      annualKwhPerKwp: monthlyKwhPerKwp.reduce((a, b) => a + b, 0),
      monthlyKwhPerKwp,
      orientation: "south",
      tiltDegrees: 30,
      orientationAssumed: false,
      tiltAssumed: false,
      dataSource: "PVGIS",
      calculationDate: "2026-01-01",
    },
    consumption: { annualKwh: 10000, monthlyKwh: null },
    electrical: { mainFuseAmp: 25, kwPerAmp: 0.69 },
    economics: {
      selfConsumedValuePerKwh: 1.5,
      exportValuePerKwh: 0.5,
      currency: "SEK",
    },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: [1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15],
    ...overrides,
  };
}

describe("electricity price standard values", () => {
  it("keeps exactly 13 active markets", () => {
    expect(ACTIVE_MARKET_CODES).toHaveLength(13);
  });

  it("has a versioned defaults identifier", () => {
    expect(ELECTRICITY_PRICE_DEFAULTS_VERSION).toBe("2026-09");
  });

  it("has the exact standard values and currency in every active market", () => {
    for (const code of ACTIVE_MARKET_CODES) {
      const market = MARKETS[code]!;
      const expected = EXPECTED[code]!;
      expect(market.currency).toBe(expected.currency);
      expect(market.selfConsumedElectricityValue).toBe(expected.self);
      expect(market.exportElectricityValue).toBe(expected.export);
    }
  });

  it("never leaves an active market without standard values", () => {
    for (const code of ACTIVE_MARKET_CODES) {
      const market = MARKETS[code]!;
      expect(market.selfConsumedElectricityValue).not.toBeNull();
      expect(market.exportElectricityValue).not.toBeNull();
      expect(market.selfConsumedElectricityValue!).toBeGreaterThan(0);
      expect(market.exportElectricityValue!).toBeGreaterThan(0);
    }
  });

  it("does not activate NO, NL or HR", () => {
    const active = ACTIVE_MARKET_CODES as readonly string[];
    for (const code of ["NO", "NL", "HR"]) expect(active).not.toContain(code);
  });
});

describe("price values in the calculation", () => {
  it("marks market values as standard-value by default", () => {
    const result = calculateSolarSystem(baseInput());
    expect(result.economics.selfConsumedValueSource).toBe("standard-value");
    expect(result.economics.exportValueSource).toBe("standard-value");
  });

  it("uses user values instead of the standard values", () => {
    const standard = calculateSolarSystem(baseInput());
    const custom = calculateSolarSystem(
      baseInput({
        economics: {
          selfConsumedValuePerKwh: 3,
          exportValuePerKwh: 1,
          currency: "SEK",
          selfConsumedValueSource: "user-override",
          exportValueSource: "user-override",
        },
      }),
    );
    expect(custom.economics.selfConsumedValuePerKwh).toBe(3);
    expect(custom.economics.selfConsumedValueSource).toBe("user-override");
    expect(custom.economics.exportValueSource).toBe("user-override");
    // Economy, investment level and the 30-year value all follow the change.
    expect(custom.economics.totalValue).toBeGreaterThan(standard.economics.totalValue);
    expect(custom.investment.maxInvestment).toBeGreaterThan(standard.investment.maxInvestment);
    expect(custom.lifetime.totalEconomicValue).toBeGreaterThan(standard.lifetime.totalEconomicValue);
  });

  it("rejects negative prices but accepts 0 as a manual value", () => {
    const negative = calculateSolarSystem(
      baseInput({
        economics: { selfConsumedValuePerKwh: -2, exportValuePerKwh: -1, currency: "SEK" },
      }),
    );
    expect(negative.economics.selfConsumedValuePerKwh).toBe(0);
    expect(negative.economics.exportValuePerKwh).toBe(0);

    const zero = calculateSolarSystem(
      baseInput({
        economics: {
          selfConsumedValuePerKwh: 0,
          exportValuePerKwh: 0,
          currency: "SEK",
          selfConsumedValueSource: "user-override",
          exportValueSource: "user-override",
        },
      }),
    );
    expect(zero.economics.selfConsumedValuePerKwh).toBe(0);
    expect(zero.economics.totalValue).toBe(0);
    expect(zero.economics.selfConsumedValueSource).toBe("user-override");
  });

  it("uses one presented set of values for UI and PDF", () => {
    const result = calculateSolarSystem(baseInput());
    // The PDF reads exactly these fields, no separate rounding.
    expect(result.presentation.annualSavings).toBe(
      result.presentation.selfConsumptionValue + result.presentation.exportValue,
    );
    expect(result.economics.selfConsumedValuePerKwh).toBe(1.5);
    expect(result.economics.exportValuePerKwh).toBe(0.5);
  });

  it("assumes 0 % annual price change over the 30-year period", () => {
    const result = calculateSolarSystem(baseInput());
    expect(result.lifetime.annualPriceChangeRate).toBe(0);
    expect(result.lifetime.periodYears).toBe(30);
  });
});
