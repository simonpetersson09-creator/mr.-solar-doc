import { describe, expect, it } from "vitest";
import { calculate } from "./engine";
import type { CalculationInput, LoadProfileClass } from "./types";

const baseInput = (): CalculationInput => ({
  location: {
    label: "Stockholm",
    latitude: 59.33,
    longitude: 18.07,
    countryCode: "SE",
    source: "geocode",
  },
  tiltDeg: 35,
  orientation: "south",
  annualConsumptionKwh: 20000,
  mainFuseAmps: 25,
  electricityPricePerKwh: 1.5,
  solarResource: { annualIrradiationKwhPerKwp: 1000, source: "fallback" },
});

const run = (extra: Partial<CalculationInput>) => calculate({ ...baseInput(), ...extra });

describe("load profile plumbing", () => {
  it("treats a missing profile the same as mixed", () => {
    const missing = run({});
    const mixed = run({ loadProfileClass: "mixed" });
    expect(missing.loadProfileClass).toBe("mixed");
    expect(missing.presentation.selfConsumptionKwh).toBe(mixed.presentation.selfConsumptionKwh);
    expect(missing.economics.annualSavings).toBe(mixed.economics.annualSavings);
  });

  it("carries the choice through to the result", () => {
    for (const profile of ["evening", "mixed", "daytime"] as LoadProfileClass[]) {
      expect(run({ loadProfileClass: profile }).loadProfileClass).toBe(profile);
    }
  });

  it("orders modelled self-consumption evening < mixed < daytime", () => {
    const evening = run({ loadProfileClass: "evening" }).selfConsumptionShare;
    const mixed = run({ loadProfileClass: "mixed" }).selfConsumptionShare;
    const daytime = run({ loadProfileClass: "daytime" }).selfConsumptionShare;
    expect(evening).toBeLessThan(mixed);
    expect(mixed).toBeLessThan(daytime);
  });

  it("leaves a manually entered self-consumption share untouched", () => {
    const override = { selfConsumptionShare: 0.55, selfConsumptionShareIsUserSet: true };
    const evening = run({ ...override, loadProfileClass: "evening" });
    const daytime = run({ ...override, loadProfileClass: "daytime" });
    expect(evening.selfConsumptionSource).toBe("user-override");
    expect(evening.selfConsumptionShare).toBeCloseTo(0.55, 6);
    expect(daytime.selfConsumptionShare).toBeCloseTo(0.55, 6);
  });
});
