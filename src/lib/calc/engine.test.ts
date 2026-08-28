import { describe, expect, it } from "vitest";

import { calculateSolarSystem } from "./engine";
import { MARKETS } from "@/config/markets";
import type { CalculationInput } from "./types";

/** Stockholm-like PVGIS reference: ~938 kWh/kWp, south, 30 degrees. */
const MONTHLY_KWH_PER_KWP = [
  22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5,
];

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
      selfConsumedValuePerKwh: 1.5,
      exportValuePerKwh: 0.6,
      currency: "SEK",
    },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: market.inverterSizesKw,
    ...overrides,
  };
}

describe("calculateSolarSystem – self-consumption invariants", () => {
  it("never reports self-sufficiency above 100 % when production far exceeds consumption", () => {
    const result = calculateSolarSystem(
      makeInput({ consumption: { annualKwh: 1_000, monthlyKwh: null } }),
    );
    expect(result.selfSufficiencyRate).toBeLessThanOrEqual(1);
    expect(result.selfConsumptionRate).toBeLessThanOrEqual(1);
    expect(result.selfConsumedKwh).toBeLessThanOrEqual(1_000 + 1e-9);
    expect(result.selfConsumedKwh).toBeLessThanOrEqual(result.annualProductionKwh + 1e-9);
    expect(result.exportedKwh).toBeCloseTo(
      result.annualProductionKwh - result.selfConsumedKwh,
      6,
    );
  });

  it("keeps the presented parts summing to the presented total", () => {
    const result = calculateSolarSystem(makeInput());
    const p = result.presentation;
    expect(p.selfConsumptionKwh + p.exportedKwh).toBe(p.annualProductionKwh);
    expect(p.selfConsumptionValue + p.exportValue).toBe(p.annualSavings);
    expect(p.selfConsumptionPercent + p.exportPercent).toBe(100);
  });
});

describe("calculateSolarSystem – rounding consistency", () => {
  it("derives the investment level from exactly the presented annual value", () => {
    for (const annualKwh of [2_000, 5_000, 8_000, 13_777, 21_000]) {
      const result = calculateSolarSystem(
        makeInput({ consumption: { annualKwh, monthlyKwh: null } }),
      );
      expect(result.investment.annualEconomicValue).toBe(result.presentation.annualSavings);
      expect(result.investment.maxInvestment).toBe(
        result.presentation.annualSavings * result.investment.acceptedPaybackYears,
      );
    }
  });
});

describe("calculateSolarSystem – negative economic inputs", () => {
  it("clamps negative per-kWh values at the calculation layer", () => {
    const result = calculateSolarSystem(
      makeInput({
        economics: {
          selfConsumedValuePerKwh: -1.5,
          exportValuePerKwh: -0.6,
          currency: "SEK",
        },
      }),
    );
    expect(result.economics.selfConsumedValuePerKwh).toBe(0);
    expect(result.economics.exportValuePerKwh).toBe(0);
    expect(result.economics.totalValue).toBe(0);
    expect(result.presentation.annualSavings).toBe(0);
    expect(result.investment.maxInvestment).toBe(0);
    expect(result.lifetime.totalEconomicValue).toBe(0);
  });
});

describe("calculateSolarSystem – inverter sizing for small arrays", () => {
  const cases = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20, 25];

  it.each(cases)("keeps DC/AC at or below the ceiling for a ~%s kWp target", (targetKwp) => {
    const annualKwh = targetKwp * 938;
    const result = calculateSolarSystem(
      makeInput({
        consumption: { annualKwh, monthlyKwh: null },
        electrical: { mainFuseAmp: 63, kwPerAmp: MARKETS["SE"]!.kwPerAmp },
      }),
    );
    expect(result.dcAcRatio).toBeLessThanOrEqual(1.3 + 1e-9);
    // Small arrays must no longer be forced onto an oversized inverter.
    expect(result.dcAcRatio).toBeGreaterThan(0.8);
  });

  it("distinguishes a below-target ratio from an above-target one", () => {
    const notes = calculateSolarSystem(makeInput()).notes;
    expect(notes).not.toContain("dc-ac-ratio-outside-target-window");
    for (const note of notes) {
      expect(note).not.toBe("dc-ac-ratio-outside-target-window");
    }
  });
});
