import { describe, expect, it } from "vitest";

import { runCalculation } from "./engine";
import { selectRecommendedSystem } from "./candidate-selection";
import { MARKETS } from "@/config/markets";
import { ABSOLUTE_MAX_DC_AC_RATIO, PANEL_WATTAGE_KWP } from "@/config/constants";
import type { CalculationInput } from "./types";

/** Stockholm-like PVGIS reference: ~938 kWh/kWp, south, 30 degrees. */
const MONTHLY_KWH_PER_KWP = [22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5];
const ANNUAL_KWH_PER_KWP = MONTHLY_KWH_PER_KWP.reduce((a, b) => a + b, 0);
const SIZES = MARKETS["SE"]!.inverterSizesKw;

function makeInput(annualKwh: number, maxAcPowerKw: number): CalculationInput {
  return {
    location: {
      address: "Testgatan 1",
      latitude: 59.33,
      longitude: 18.07,
      countryCode: "SE",
      region: "Stockholm",
    },
    resource: {
      annualKwhPerKwp: ANNUAL_KWH_PER_KWP,
      monthlyKwhPerKwp: MONTHLY_KWH_PER_KWP,
      orientation: "south",
      tiltDegrees: 30,
      orientationAssumed: false,
      tiltAssumed: false,
      dataSource: "PVGIS test",
      calculationDate: "2026-01-01",
    },
    consumption: { annualKwh, monthlyKwh: null },
    electrical: { mainFuseAmp: 25, maxAcPowerKw },
    economics: {
      selfConsumedValuePerKwh: 1.5,
      exportValuePerKwh: 0.6,
      currency: "SEK",
    },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: SIZES,
  } as CalculationInput;
}

/** Consumption x connection sweep across the whole realistic domain. */
const CONSUMPTIONS = [500, 1_500, 3_000, 5_000, 8_000, 12_000, 20_000, 35_000, 60_000];
const AC_LIMITS = [3.68, 6.9, 11.04, 17.32, 27.7, 43.5];

describe("sizing invariants across the full domain", () => {
  const cases = CONSUMPTIONS.flatMap((kwh) => AC_LIMITS.map((ac) => ({ kwh, ac })));

  it.each(cases)("$kwh kWh on a $ac kW connection stays physical", ({ kwh, ac }) => {
    const outcome = runCalculation(makeInput(kwh, ac));
    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    const r = outcome.result;

    // Whole modules, and DC power is exactly the module count times module size.
    expect(Number.isInteger(r.panelCount)).toBe(true);
    expect(r.panelCount).toBeGreaterThan(0);
    expect(r.panelPowerKwp).toBe(PANEL_WATTAGE_KWP);
    expect(r.installedKwp).toBeCloseTo(r.panelCount * r.panelPowerKwp, 9);

    // The DC/AC ceiling is absolute, and the ratio is never a stale number.
    expect(r.dcAcRatio).toBeLessThanOrEqual(ABSOLUTE_MAX_DC_AC_RATIO + 1e-9);
    expect(r.dcAcRatio).toBeCloseTo(r.installedKwp / r.inverterKw, 9);

    // The inverter is a real product that fits the connection.
    expect(SIZES).toContain(r.inverterKw);
    expect(r.inverterKw).toBeLessThanOrEqual(ac + 1e-9);
  });

  it("never exceeds the DC/AC ceiling for any inverter in the catalogue", () => {
    for (const inverterKw of SIZES) {
      const outcome = selectRecommendedSystem({
        targetKwp: inverterKw * 2,
        maxAcPowerKw: inverterKw,
        inverterSizesKw: SIZES,
        panelPowerKwp: PANEL_WATTAGE_KWP,
        targetRange: { min: 1.1, max: 1.2 },
        monthlyKwhPerKwp: MONTHLY_KWH_PER_KWP,
        annualConsumptionKwh: 20_000,
        monthlyConsumptionKwh: null,
        solarSeasonProductionShare: 0.65,
      });
      if (outcome.status !== "ok") continue;
      expect(outcome.best.dcAcRatio).toBeLessThanOrEqual(ABSOLUTE_MAX_DC_AC_RATIO + 1e-9);
      expect(outcome.best.installedKwp).toBeCloseTo(
        outcome.best.panelCount * PANEL_WATTAGE_KWP,
        9,
      );
    }
  });
});

describe("grid too small", () => {
  it("is a controlled outcome, not a validation error", () => {
    const outcome = runCalculation(makeInput(8_000, 1));
    expect(outcome.status).toBe("grid-too-small");
    if (outcome.status !== "grid-too-small") return;
    expect(outcome.maxAcPowerKw).toBe(1);
    expect(outcome.minimumSupportedInverterKw).toBe(Math.min(...SIZES));
  });

  it("still produces a system at the smallest supported inverter", () => {
    const outcome = runCalculation(makeInput(8_000, Math.min(...SIZES)));
    expect(outcome.status).toBe("success");
  });
});

describe("size follows the motivated need", () => {
  it("does not grow a tiny household into a large array", () => {
    const outcome = runCalculation(makeInput(500, 17.32));
    expect(outcome.status).toBe("success");
    if (outcome.status !== "success") return;
    expect(outcome.result.installedKwp).toBeLessThan(3);
    expect(outcome.result.notes).toContain("minimum-system-size");
  });

  it("grows monotonically with consumption on an unconstrained connection", () => {
    let previous = 0;
    for (const kwh of CONSUMPTIONS) {
      const outcome = runCalculation(makeInput(kwh, 43.5));
      expect(outcome.status).toBe("success");
      if (outcome.status !== "success") return;
      expect(outcome.result.installedKwp).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = outcome.result.installedKwp;
    }
  });
});
