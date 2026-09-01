import { describe, expect, it } from "vitest";
import { calculateSolarSystem } from "./engine";
import { calculateMaxInvestment } from "./payback";
import type { CalculationInput } from "./types";
import { MAX_PAYBACK_YEARS, MIN_PAYBACK_YEARS } from "@/config/constants";

function input(paybackYears: number): CalculationInput {
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
    consumption: { annualKwh: 12000, monthlyKwh: null },
    electrical: { mainFuseAmp: 25, kwPerAmp: 0.69 },
    economics: { selfConsumedValuePerKwh: 1.5, exportValuePerKwh: 0.5, currency: "SEK" },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: paybackYears,
    inverterSizesKw: [1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15],
  };
}

describe("engine payback scenarios", () => {
  it("exposes selected -2 / selected / selected +2 investment levels", () => {
    const result = calculateSolarSystem(input(12));
    expect(result.investmentScenarios.map((s) => s.paybackYears)).toEqual([10, 12, 14]);
    const selected = result.investmentScenarios.find((s) => s.selected);
    expect(selected?.paybackYears).toBe(12);
    // The selected scenario matches the headline investment level exactly.
    expect(selected?.maxInvestmentRounded).toBe(result.investment.maxInvestmentRounded);
  });

  it("derives every scenario from the same lifetime model", () => {
    const result = calculateSolarSystem(input(12));
    for (const scenario of result.investmentScenarios) {
      const direct = calculateMaxInvestment(
        result.presentation.annualSavings,
        scenario.paybackYears,
        null,
        result.lifetime.years.map(
          (year) =>
            year.economicValue *
            (result.lifetime.years[0]!.economicValue > 0
              ? result.presentation.annualSavings / result.lifetime.years[0]!.economicValue
              : 1),
        ),
      );
      expect(scenario.maxInvestmentRounded).toBe(direct.maxInvestmentRounded);
    }
  });

  it("clamps scenarios to the allowed payback range", () => {
    const low = calculateSolarSystem(input(MIN_PAYBACK_YEARS));
    expect(low.investmentScenarios[0]!.paybackYears).toBe(MIN_PAYBACK_YEARS);
    const high = calculateSolarSystem(input(MAX_PAYBACK_YEARS));
    expect(
      high.investmentScenarios[high.investmentScenarios.length - 1]!.paybackYears,
    ).toBe(MAX_PAYBACK_YEARS);
  });
});
