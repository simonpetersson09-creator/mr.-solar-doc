import { describe, expect, it } from "vitest";

import {
  applyClippingLoss,
  clippingModelMatchesRatio,
  computeClippingLoss,
  type HourlyPowerSample,
} from "./clipping";
import { calculateSolarSystem } from "./engine";
import { MARKETS } from "@/config/markets";
import { EU_THREE_PHASE_INVERTER_SIZES_KW } from "@/config/inverter-catalog";
import { ABSOLUTE_MAX_DC_AC_RATIO, MAX_RECOMMENDED_KWP } from "@/config/constants";
import type { CalculationInput } from "./types";

/** Two January hours and two July hours of AC power per kWp (W). */
function hours(): HourlyPowerSample[] {
  return [
    { time: "20200115:1100", powerW: 400 },
    { time: "20200115:1200", powerW: 500 },
    { time: "20200715:1100", powerW: 800 },
    { time: "20200715:1200", powerW: 900 },
  ];
}

describe("computeClippingLoss", () => {
  it("removes nothing when the array never reaches the inverter limit", () => {
    const model = computeClippingLoss({
      hourly: hours(),
      dcAcRatio: 1.0,
      dataSource: "test",
      year: 2020,
    });
    expect(model.annualLossShare).toBe(0);
    expect(model.monthlyLossShare.every((share) => share === 0)).toBe(true);
  });

  it("clips only the hours above the inverter's rated AC power", () => {
    // Ratio 1.3: the July hours reach 1.04 and 1.17 kW per kW of inverter.
    const model = computeClippingLoss({
      hourly: hours(),
      dcAcRatio: 1.3,
      dataSource: "PVGIS-SARAH3",
      year: 2020,
    });
    // January stays below the limit (0.52 and 0.65 kW), so no loss at all.
    expect(model.monthlyLossShare[0]).toBe(0);
    // July: produced 1.04 + 1.17 = 2.21, clipped 0.04 + 0.17 = 0.21.
    expect(model.monthlyLossShare[6]).toBeCloseTo(0.21 / 2.21, 6);
    const produced = 0.52 + 0.65 + 1.04 + 1.17;
    expect(model.annualLossShare).toBeCloseTo(0.21 / produced, 6);
    expect(model.dataSource).toBe("PVGIS-SARAH3");
    expect(model.year).toBe(2020);
  });

  it("is scale invariant: the share depends on the ratio, not the system size", () => {
    const single = computeClippingLoss({
      hourly: hours(),
      dcAcRatio: 1.25,
      dataSource: "test",
      year: 2020,
    });
    // The same hourly shape repeated cannot change the clipped fraction.
    const doubled = computeClippingLoss({
      hourly: [...hours(), ...hours()],
      dcAcRatio: 1.25,
      dataSource: "test",
      year: 2020,
    });
    expect(doubled.annualLossShare).toBeCloseTo(single.annualLossShare, 12);
  });

  it("grows monotonically with the DC/AC ratio", () => {
    const shares = [1.05, 1.15, 1.3].map(
      (ratio) =>
        computeClippingLoss({ hourly: hours(), dcAcRatio: ratio, dataSource: "t", year: 2020 })
          .annualLossShare,
    );
    expect(shares[0]!).toBeLessThanOrEqual(shares[1]!);
    expect(shares[1]!).toBeLessThan(shares[2]!);
  });
});

describe("applyClippingLoss", () => {
  it("reduces each month by its own share and reports the removed energy", () => {
    const monthly = [100, 200, 300];
    const applied = applyClippingLoss(monthly, [0, 0.1, 0.2]);
    expect(applied.monthlyProductionKwh).toEqual([100, 180, 240]);
    expect(applied.clippedKwh).toBeCloseTo(80, 9);
  });
});

describe("clippingModelMatchesRatio", () => {
  it("accepts the same ratio within tolerance and rejects a different system", () => {
    expect(clippingModelMatchesRatio({ dcAcRatio: 1.2 }, 1.202)).toBe(true);
    expect(clippingModelMatchesRatio({ dcAcRatio: 1.2 }, 1.25)).toBe(false);
  });
});

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

describe("calculateSolarSystem – inverter clipping", () => {
  it("states that clipping is not modelled when no hourly model is supplied", () => {
    const result = calculateSolarSystem(makeInput());
    expect(result.clipping.modelled).toBe(false);
    expect(result.clipping.clippedKwh).toBe(0);
    expect(result.clipping.lossShare).toBe(0);
    expect(result.clipping.dataSource).toBeNull();
    // Production is untouched, so the note must say clipping is absent.
    expect(result.annualProductionKwh).toBeCloseTo(
      result.clipping.unclippedAnnualProductionKwh,
      9,
    );
    expect(result.notes).toContain(
      result.clipping.applicable ? "clipping-not-modelled" : "clipping-not-applicable",
    );
  });

  it("ignores a model computed for another DC/AC ratio", () => {
    const base = calculateSolarSystem(makeInput());
    const result = calculateSolarSystem(
      makeInput({
        clipping: {
          dcAcRatio: base.dcAcRatio + 0.2,
          monthlyLossShare: new Array<number>(12).fill(0.5),
          annualLossShare: 0.5,
          dataSource: "test",
          year: 2020,
        },
      }),
    );
    expect(result.clipping.modelled).toBe(false);
    expect(result.annualProductionKwh).toBeCloseTo(base.annualProductionKwh, 9);
  });

  it("applies a matching model to production, self-consumption and export", () => {
    const base = calculateSolarSystem(makeInput());
    const monthlyLossShare = new Array<number>(12).fill(0);
    monthlyLossShare[5] = 0.1;
    monthlyLossShare[6] = 0.1;
    const result = calculateSolarSystem(
      makeInput({
        clipping: {
          dcAcRatio: base.dcAcRatio,
          monthlyLossShare,
          annualLossShare: 0.02,
          dataSource: "PVGIS-SARAH3",
          year: 2020,
        },
      }),
    );

    expect(result.clipping.modelled).toBe(true);
    expect(result.clipping.dataSource).toBe("PVGIS-SARAH3");
    expect(result.clipping.year).toBe(2020);
    expect(result.notes).toContain("clipping-modelled");
    // Same system size, less energy.
    expect(result.installedKwp).toBe(base.installedKwp);
    expect(result.inverterKw).toBe(base.inverterKw);
    expect(result.annualProductionKwh).toBeLessThan(base.annualProductionKwh);
    expect(result.clipping.clippedKwh).toBeCloseTo(
      base.annualProductionKwh - result.annualProductionKwh,
      6,
    );
    expect(result.clipping.lossShare).toBeCloseTo(
      result.clipping.clippedKwh / result.clipping.unclippedAnnualProductionKwh,
      9,
    );
    // The energy balance still closes on the clipped production.
    expect(result.selfConsumedKwh + result.exportedKwh).toBeCloseTo(
      result.annualProductionKwh,
      6,
    );
    expect(result.monthlyProductionKwh.reduce((a, b) => a + b, 0)).toBeCloseTo(
      result.annualProductionKwh,
      6,
    );
  });
});

describe("large-system catalogue", () => {
  it("offers commercial three-phase inverters up to 200 kW", () => {
    expect(EU_THREE_PHASE_INVERTER_SIZES_KW.at(-1)).toBe(200);
    // Strictly increasing, so the selection ladder stays well defined.
    for (let i = 1; i < EU_THREE_PHASE_INVERTER_SIZES_KW.length; i += 1) {
      expect(EU_THREE_PHASE_INVERTER_SIZES_KW[i]!).toBeGreaterThan(
        EU_THREE_PHASE_INVERTER_SIZES_KW[i - 1]!,
      );
    }
  });

  it("allows an array that fills the largest inverter at the DC/AC ceiling", () => {
    expect(MAX_RECOMMENDED_KWP).toBeGreaterThanOrEqual(200 * ABSOLUTE_MAX_DC_AC_RATIO);
  });

  it("sizes a large consumer with a large connection and stays within the ceiling", () => {
    const result = calculateSolarSystem(
      makeInput({
        consumption: { annualKwh: 400_000, monthlyKwh: null },
        electrical: { mainFuseAmp: 400, kwPerAmp: MARKETS["SE"]!.kwPerAmp },
      }),
    );
    expect(result.inverterKw).toBeGreaterThan(60);
    expect(result.dcAcRatio).toBeLessThanOrEqual(ABSOLUTE_MAX_DC_AC_RATIO + 1e-9);
    expect(result.installedKwp).toBeLessThanOrEqual(MAX_RECOMMENDED_KWP + 1e-9);
  });
});
