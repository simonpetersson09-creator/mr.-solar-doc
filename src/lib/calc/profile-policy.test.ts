import { describe, expect, it } from "vitest";
import { calculateSolarSystem } from "./engine";
import type { CalculationInput } from "./types";
import { monthlyOverlapCapKwh } from "./self-consumption";
import { selfConsumptionCapNoteKey } from "../self-consumption-cap-note";
import { readCalculationSnapshot, type CalculationSnapshot } from "../calculation-snapshot";

const months = [1600, 1400, 1100, 700, 400, 250, 250, 300, 600, 1000, 1400, 1400];
const input: CalculationInput = {
  location: { address: "Stockholm", latitude: 59.33, longitude: 18.07, countryCode: "SE", region: "Stockholm" },
  resource: { annualKwhPerKwp: 1040, monthlyKwhPerKwp: [20,40,80,120,150,160,155,130,90,50,25,20], orientation: "south", tiltDegrees: 30, orientationAssumed: false, tiltAssumed: false, dataSource: "test", calculationDate: "2026-09-12" },
  consumption: { annualKwh: 10400, monthlyKwh: months, inputType: "annual-profile", isEstimated: true },
  electrical: { mainFuseAmp: 25, kwPerAmp: 0.69 },
  economics: { selfConsumedValuePerKwh: 1.44, exportValuePerKwh: 0.6, currency: "SEK" },
  selfConsumptionShare: 0.9, selfConsumptionShareIsUserSet: true, acceptedPaybackYears: 12,
};

describe("monthly provenance policy throughout the engine", () => {
  it.each(["annual-profile", "partial-profile", "unknown"] as const)("manual %s months are advisory in every year", (inputType) => {
    const r = calculateSolarSystem({ ...input, consumption: { ...input.consumption, inputType } });
    expect(r.selfConsumedKwh).toBeCloseTo(Math.min(r.annualProductionKwh * 0.9, 10400), 8);
    expect(r.presentation.estimatedMonthlyDeviation).toBe(true);
    expect(selfConsumptionCapNoteKey(r.presentation)).toMatch(/Estimated/);
    for (const y of r.lifetime.years) {
      expect(y.selfConsumptionKwh).toBeCloseTo(Math.min(y.productionKwh * 0.9, 10400), 8);
      expect(y.selfConsumptionKwh + y.exportedKwh).toBeCloseTo(y.productionKwh, 8);
    }
    expect(r.economics.totalValue).toBeCloseTo(r.selfConsumedKwh * 1.44 + r.exportedKwh * 0.6, 8);
  });
  it.each(["monthly-manual", "imported"] as const)("actual %s months bind in every year", (inputType) => {
    const r = calculateSolarSystem({ ...input, consumption: { ...input.consumption, inputType, isEstimated: false } });
    expect(r.selfConsumedKwh).toBeCloseTo(monthlyOverlapCapKwh(r.monthlyProductionKwh, months) ?? -1, 8);
    expect(selfConsumptionCapNoteKey(r.presentation)).toBe("result.selfConsumptionCappedMonthlyNote");
    for (const y of r.lifetime.years) {
      const cap = monthlyOverlapCapKwh(r.monthlyProductionKwh.map(v => v * y.productionKwh / r.annualProductionKwh), months);
      expect(y.selfConsumptionKwh).toBeLessThanOrEqual((cap ?? 0) + 1e-8);
    }
  });
  it("automatic mode is unchanged by estimated origin and reset returns to it", () => {
    const auto = calculateSolarSystem({ ...input, selfConsumptionShareIsUserSet: false });
    const actual = calculateSolarSystem({ ...input, selfConsumptionShareIsUserSet: false, consumption: { ...input.consumption, inputType: "monthly-manual", isEstimated: false } });
    expect(auto.selfConsumedKwh).toBe(actual.selfConsumedKwh);
    expect(auto.selfConsumptionSource).toBe("simulated");
    expect(auto.presentation.estimatedMonthlyDeviation).toBe(false);
  });
  it("saved new results preserve the exact lifetime and PDF presentation; legacy amounts stay untouched", () => {
    const result = calculateSolarSystem(input);
    const snapshot = { version: 2, result, assumptions: { consumptionInputType: "annual-profile" } } as CalculationSnapshot;
    const restored = readCalculationSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.result).toEqual(result);
    expect(selfConsumptionCapNoteKey(restored.result.presentation)).toBe(selfConsumptionCapNoteKey(result.presentation));
    const legacy = { ...snapshot, version: 1, assumptions: { ...snapshot.assumptions, consumptionInputType: "monthly-manual" as const } };
    const read = readCalculationSnapshot(legacy);
    expect(read.result.consumption.inputType).toBe("unknown");
    expect(read.result.consumption.isEstimated).toBe(true);
    expect(read.result.lifetime).toEqual(legacy.result.lifetime);
    expect(read.result.selfConsumedKwh).toBe(legacy.result.selfConsumedKwh);
    expect(legacy.assumptions.consumptionInputType).toBe("monthly-manual");
  });
});