import { describe, expect, it } from "vitest";
import { DEFAULT_GRID_PROFILE, kwPerAmpFor } from "./grid";
import { maxAcPowerFromFuse, recommendInverter } from "@/lib/calc/inverter-sizing";

const CASES = [
  { phases: 3 as const, voltage: 400, amp: 16, expected: 11.09 },
  { phases: 3 as const, voltage: 400, amp: 25, expected: 17.32 },
  { phases: 3 as const, voltage: 230, amp: 25, expected: 9.96 },
  { phases: 1 as const, voltage: 230, amp: 16, expected: 3.68 },
  { phases: 1 as const, voltage: 230, amp: 25, expected: 5.75 },
];

describe("dynamic grid profile", () => {
  it("defaults to 3-phase 400 V 50 Hz", () => {
    expect(DEFAULT_GRID_PROFILE).toEqual({ phaseCount: 3, voltageV: 400, frequencyHz: 50 });
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
