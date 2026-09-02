import { describe, expect, it } from "vitest";

import { calculateSolarSystem } from "./engine";
import { MARKETS } from "@/config/markets";
import type { CalculationInput } from "./types";

/**
 * Rounding must never leak into the economics. Presentation rounds to whole
 * currency units, so a very small annual value used to be scaled by
 * `rounded / unrounded` — which either zeroed the 30-year projection or
 * magnified it. These tests pin the unrounded behaviour.
 */
const MONTHLY_KWH_PER_KWP = [22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5];

function makeInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  const market = MARKETS["SE"]!;
  return {
    location: {
      address: "Testgatan 1, Stockholm",
      latitude: 59.33,
      longitude: 18.07,
      countryCode: "SE",
      region: "Stockholm",
    },
    resource: {
      annualKwhPerKwp: MONTHLY_KWH_PER_KWP.reduce((a, b) => a + b, 0),
      monthlyKwhPerKwp: MONTHLY_KWH_PER_KWP,
      orientation: "south",
      tiltDegrees: 30,
      orientationAssumed: false,
      tiltAssumed: false,
      dataSource: "PVGIS test",
      calculationDate: "2026-01-01",
    },
    consumption: { annualKwh: 8_000, monthlyKwh: null },
    electrical: { mainFuseAmp: 25, kwPerAmp: market.kwPerAmp },
    economics: {
      selfConsumedValuePerKwh: 0.00002,
      exportValuePerKwh: 0.00001,
      currency: "SEK",
    },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: market.inverterSizesKw,
    ...overrides,
  };
}

describe("very small economic values", () => {
  it("keeps a positive lifetime value even when the presented year-1 value rounds to 0", () => {
    const result = calculateSolarSystem(makeInput());

    expect(result.presentation.annualSavings).toBe(0);
    expect(result.lifetime.years[0]!.economicValue).toBeGreaterThan(0);
    expect(result.investment.annualEconomicValue).toBeGreaterThan(0);
    expect(result.investment.maxInvestment).toBeGreaterThan(0);
    expect(result.productionCost.selfConsumedValuePerKwh ?? 1).toBeGreaterThanOrEqual(0);
  });

  it("does not magnify the projection when the year-1 value rounds up", () => {
    // 0.6 currency/kWh-ish values chosen so year 1 rounds UP to the next unit.
    const result = calculateSolarSystem(
      makeInput({
        economics: {
          selfConsumedValuePerKwh: 0.00006,
          exportValuePerKwh: 0.00006,
          currency: "SEK",
        },
      }),
    );

    const unroundedYearOne = result.lifetime.years[0]!.economicValue;
    expect(result.investment.annualEconomicValue).toBeCloseTo(unroundedYearOne, 6);
    // Max investment must stay within the unrounded accumulated value.
    const accumulated = result.lifetime.years
      .slice(0, 12)
      .reduce((sum, year) => sum + year.economicValue, 0);
    expect(result.investment.maxInvestment).toBeLessThanOrEqual(accumulated + 1e-9);
  });

  it("scales linearly with the input price — no rounding plateau", () => {
    const small = calculateSolarSystem(makeInput());
    const tenTimes = calculateSolarSystem(
      makeInput({
        economics: {
          selfConsumedValuePerKwh: 0.0002,
          exportValuePerKwh: 0.0001,
          currency: "SEK",
        },
      }),
    );
    expect(tenTimes.investment.maxInvestment).toBeCloseTo(small.investment.maxInvestment * 10, 6);
  });
});
