import { describe, expect, it } from "vitest";

import { calculateSolarSystem } from "./engine";
import { MARKETS } from "@/config/markets";
import type { CalculationInput, LoadProfileClass } from "./types";

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

const run = (extra: Partial<CalculationInput> = {}) =>
  calculateSolarSystem(makeInput({ consumption: { annualKwh: 20_000, monthlyKwh: null }, ...extra }));

describe("load profile plumbing", () => {
  it("treats a missing profile the same as mixed", () => {
    const missing = run();
    const mixed = run({ loadProfileClass: "mixed" });
    expect(missing.loadProfileClass).toBe("mixed");
    expect(missing.selfConsumedKwh).toBeCloseTo(mixed.selfConsumedKwh, 9);
    expect(missing.selfConsumptionRate).toBeCloseTo(mixed.selfConsumptionRate, 9);
  });

  it("carries the choice through to the result", () => {
    for (const profile of ["evening", "mixed", "daytime"] as LoadProfileClass[]) {
      expect(run({ loadProfileClass: profile }).loadProfileClass).toBe(profile);
    }
  });

  it("orders modelled self-consumption evening < mixed < daytime", () => {
    const evening = run({ loadProfileClass: "evening" });
    const mixed = run({ loadProfileClass: "mixed" });
    const daytime = run({ loadProfileClass: "daytime" });
    expect(evening.selfConsumptionSource).not.toBe("user-override");
    expect(evening.selfConsumptionRate).toBeLessThan(mixed.selfConsumptionRate);
    expect(mixed.selfConsumptionRate).toBeLessThan(daytime.selfConsumptionRate);
  });

  it("leaves a manually entered self-consumption share untouched", () => {
    const override = { selfConsumptionShare: 0.55, selfConsumptionShareIsUserSet: true };
    const evening = run({ ...override, loadProfileClass: "evening" as LoadProfileClass });
    const daytime = run({ ...override, loadProfileClass: "daytime" as LoadProfileClass });
    expect(evening.selfConsumptionSource).toBe("user-override");
    expect(evening.selfConsumptionRate).toBeCloseTo(daytime.selfConsumptionRate, 9);
    expect(evening.selfConsumedKwh).toBeCloseTo(daytime.selfConsumedKwh, 9);
  });
});
