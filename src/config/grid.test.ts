import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID_PROFILE,
  GRID_VOLTAGE_OPTIONS,
  kwPerAmpFor,
  SERVICE_TYPE_AC_FACTOR,
  SERVICE_TYPE_FOR_PHASE_COUNT,
} from "./grid";
import { maxAcPowerFromFuse, recommendInverter } from "@/lib/calc/inverter-sizing";

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
    expect(GRID_VOLTAGE_OPTIONS).toEqual([220, 230, 240, 380, 400, 415]);
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
    const singlePhase = recommendInverter({
      installedKwp: 10,
      maxAcPowerKw: maxAcPowerFromFuse(16, kwPerAmpFor(1, 230)),
      inverterSizesKw: sizes,
    });
    expect(singlePhase.inverterKw).toBeLessThanOrEqual(3.68);

    const threePhase = recommendInverter({
      installedKwp: 10,
      maxAcPowerKw: maxAcPowerFromFuse(25, kwPerAmpFor(3, 400)),
      inverterSizesKw: sizes,
    });
    expect(threePhase.inverterKw).toBeGreaterThanOrEqual(8);
    expect(threePhase.inverterKw).toBeLessThanOrEqual(17.32);
  });
});