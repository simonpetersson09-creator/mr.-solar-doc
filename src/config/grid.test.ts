import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID_PROFILE,
  SINGLE_PHASE_VOLTAGE_OPTIONS,
  THREE_PHASE_VOLTAGE_OPTIONS,
  isPresetVoltage,
  isValidCustomVoltage,
  kwPerAmpFor,
  SERVICE_TYPE_AC_FACTOR,
  SERVICE_TYPE_FOR_PHASE_COUNT,
} from "./grid";
import { maxAcPowerFromFuse } from "@/lib/calc/inverter-sizing";
import { selectRecommendedSystem } from "@/lib/calc/candidate-selection";

const CASES = [
  // Three-phase: P = sqrt(3) x U x I / 1000
  { phases: 3 as const, voltage: 400, amp: 16, expected: 11.09 },
  { phases: 3 as const, voltage: 400, amp: 25, expected: 17.32 },
  { phases: 3 as const, voltage: 230, amp: 25, expected: 9.96 },
  { phases: 3 as const, voltage: 220, amp: 25, expected: 9.53 },
  { phases: 3 as const, voltage: 240, amp: 25, expected: 10.39 },
  { phases: 3 as const, voltage: 380, amp: 25, expected: 16.45 },
  { phases: 3 as const, voltage: 415, amp: 25, expected: 17.97 },
  // Single-phase: P = U x I / 1000
  { phases: 1 as const, voltage: 230, amp: 16, expected: 3.68 },
  { phases: 1 as const, voltage: 230, amp: 25, expected: 5.75 },
  { phases: 1 as const, voltage: 240, amp: 32, expected: 7.68 },
];

describe("dynamic grid profile", () => {
  it("defaults to 3-phase 400 V 50 Hz", () => {
    expect(DEFAULT_GRID_PROFILE).toEqual({ phaseCount: 3, voltageV: 400, frequencyHz: 50 });
  });

  it("offers the extended European voltage set with 400 V first", () => {
    expect(GRID_VOLTAGE_OPTIONS).toEqual([127, 220, 230, 240, 380, 400, 415]);
    expect(GRID_VOLTAGE_OPTIONS).toContain(DEFAULT_GRID_PROFILE.voltageV);
  });

  it("3-phase 400 V yields ~0.693 kW per ampere", () => {
    const kwPerAmp = kwPerAmpFor(3, 400);
    expect(Math.abs(kwPerAmp - 0.693)).toBeLessThan(0.001);
    expect(Math.abs(maxAcPowerFromFuse(16, kwPerAmp) - 16 * 0.693)).toBeLessThan(0.02);
  });

  it("derives the AC factor from the service type, not a phase-count check", () => {
    expect(SERVICE_TYPE_FOR_PHASE_COUNT[1]).toBe("single-phase");
    expect(SERVICE_TYPE_FOR_PHASE_COUNT[3]).toBe("three-phase");
    expect(SERVICE_TYPE_AC_FACTOR["single-phase"]).toBe(1);
    expect(Math.abs(SERVICE_TYPE_AC_FACTOR["three-phase"] - Math.sqrt(3))).toBeLessThan(1e-9);
  });

  it.each(CASES)(
    "$phases-phase $voltage V $amp A -> ~$expected kW",
    ({ phases, voltage, amp, expected }) => {
      const kw = maxAcPowerFromFuse(amp, kwPerAmpFor(phases, voltage));
      expect(Math.abs(kw - expected)).toBeLessThan(0.02);
    },
  );

  it("keeps inverter sizing bounded by the dynamic AC limit", () => {
    const sizes = [1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15];
    const pick = (maxAcPowerKw: number) => {
      const outcome = selectRecommendedSystem({
        targetKwp: 10,
        maxAcPowerKw,
        inverterSizesKw: sizes,
        panelPowerKwp: 0.43,
        targetRange: { min: 1.1, max: 1.15 },
        monthlyKwhPerKwp: Array.from({ length: 12 }, () => 80),
        annualConsumptionKwh: 9000,
        monthlyConsumptionKwh: null,
        solarSeasonProductionShare: 0.65,
      });
      if (outcome.status !== "ok") throw new Error("expected a system");
      return outcome.best;
    };

    const singlePhase = pick(maxAcPowerFromFuse(16, kwPerAmpFor(1, 230)));
    expect(singlePhase.inverterKw).toBeLessThanOrEqual(3.68);

    const threePhase = pick(maxAcPowerFromFuse(25, kwPerAmpFor(3, 400)));
    expect(threePhase.inverterKw).toBeGreaterThanOrEqual(8);
    expect(threePhase.inverterKw).toBeLessThanOrEqual(17.32);
  });
});
describe("custom voltage", () => {
  it("accepts positive voltages inside plausible bounds", () => {
    for (const v of [100, 110, 277, 480]) {
      expect(isValidCustomVoltage(v)).toBe(true);
      expect(isPresetVoltage(v)).toBe(false);
    }
  });

  it("rejects missing, zero and negative voltages", () => {
    expect(isValidCustomVoltage(null)).toBe(false);
    expect(isValidCustomVoltage(0)).toBe(false);
    expect(isValidCustomVoltage(-230)).toBe(false);
    expect(isValidCustomVoltage(Number.NaN)).toBe(false);
    expect(isValidCustomVoltage(5000)).toBe(false);
  });

  it("still recognises the predefined options", () => {
    for (const v of THREE_PHASE_VOLTAGE_OPTIONS) expect(isPresetVoltage(v)).toBe(true);
    for (const v of SINGLE_PHASE_VOLTAGE_OPTIONS)
      expect(isPresetVoltage(v, "single-phase")).toBe(true);
  });

  it("feeds a custom voltage through the existing power formula", () => {
    // 3-phase 480 V: sqrt(3) x 480 / 1000
    expect(kwPerAmpFor(3, 480)).toBeCloseTo(0.8314, 4);
    expect(maxAcPowerFromFuse(25, kwPerAmpFor(3, 480))).toBeCloseTo(20.78, 2);
    // 1-phase 120 V: 120 / 1000
    expect(kwPerAmpFor(1, 120)).toBeCloseTo(0.12, 4);
    expect(maxAcPowerFromFuse(20, kwPerAmpFor(1, 120))).toBeCloseTo(2.4, 2);
  });

  it("returns to the preset value when switching back to 400 V", () => {
    expect(kwPerAmpFor(3, 400)).toBeCloseTo(0.6928, 4);
  });
});
