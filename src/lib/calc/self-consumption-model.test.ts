import { describe, expect, it } from "vitest";

import {
  modelSelfConsumptionShare,
  resolveSelfConsumptionShare,
  splitProduction,
} from "./self-consumption";
import { buildLifetimeProjection } from "./degradation";

const CONSUMPTION = 10_000;

function shareFor(production: number, consumption = CONSUMPTION) {
  return resolveSelfConsumptionShare({
    annualProductionKwh: production,
    annualConsumptionKwh: consumption,
  }).share;
}

describe("dynamic self-consumption model — golden cases (10 000 kWh villa)", () => {
  const productions = [2_000, 3_000, 5_000, 8_000, 10_000, 15_000, 20_000, 30_000];

  it("falls monotonically as production grows", () => {
    const shares = productions.map((p) => shareFor(p));
    for (let i = 1; i < shares.length; i += 1) {
      expect(shares[i]!).toBeLessThan(shares[i - 1]!);
    }
  });

  it("stays inside the calibrated reference band", () => {
    // Calibrated so the neutral point (mixed, ratio = 1) is 40 % self-consumption.
    // The curve is monotonic and bounded; the bands below are the model output
    // with tolerance. Monthly data can only lower the estimate, never raise it.
    const band: Record<number, [number, number]> = {
      2_000: [0.80, 0.85],
      5_000: [0.55, 0.66],
      10_000: [0.35, 0.45],
      15_000: [0.28, 0.35],
      20_000: [0.23, 0.30],
    };
    for (const [production, [lo, hi]] of Object.entries(band)) {
      const share = shareFor(Number(production));
      expect(share).toBeGreaterThanOrEqual(lo);
      expect(share).toBeLessThanOrEqual(hi);
    }
  });

  it("never returns the old flat 50 % for every size", () => {
    const unique = new Set(productions.map((p) => Math.round(shareFor(p) * 1000)));
    expect(unique.size).toBe(productions.length);
  });

  it("is continuous: a 1 % size change never moves the share more than 1 pp", () => {
    for (let p = 1_000; p <= 40_000; p += 500) {
      const a = shareFor(p);
      const b = shareFor(p * 1.01);
      expect(Math.abs(a - b)).toBeLessThan(0.01);
    }
  });
});

describe("edge cases", () => {
  it("handles zero, NaN, Infinity and negatives without crashing", () => {
    const cases: [number, number][] = [
      [0, 10_000],
      [10_000, 0],
      [0, 0],
      [Number.NaN, 10_000],
      [10_000, Number.NaN],
      [Number.POSITIVE_INFINITY, 10_000],
      [10_000, Number.POSITIVE_INFINITY],
      [-5_000, 10_000],
      [10_000, -5_000],
      [1, 1_000_000],
      [1_000_000, 1],
    ];
    for (const [production, consumption] of cases) {
      const share = modelSelfConsumptionShare(production, consumption);
      expect(Number.isFinite(share)).toBe(true);
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
  });
});

describe("user override", () => {
  it("keeps exactly the user's value and marks the source", () => {
    const estimate = resolveSelfConsumptionShare({
      annualProductionKwh: 12_000,
      annualConsumptionKwh: CONSUMPTION,
      userShare: 0.42,
      userSet: true,
    });
    expect(estimate.share).toBeCloseTo(0.42, 10);
    expect(estimate.source).toBe("user-override");
  });

  it("uses the model and the simulated source when the user has not chosen", () => {
    const estimate = resolveSelfConsumptionShare({
      annualProductionKwh: 12_000,
      annualConsumptionKwh: CONSUMPTION,
      userShare: 0.5,
      userSet: false,
    });
    expect(estimate.source).toBe("simulated");
    expect(estimate.share).not.toBeCloseTo(0.5, 3);
  });
});

describe("monthly data is an upper bound only", () => {
  const monthlyProduction = Array.from({ length: 12 }, (_, m) => 400 + 600 * Math.sin((m / 12) * Math.PI));
  it("never raises the modelled share", () => {
    const monthlyConsumption = Array.from({ length: 12 }, () => 2_000);
    const withMonthly = resolveSelfConsumptionShare({
      annualProductionKwh: monthlyProduction.reduce((a, b) => a + b, 0),
      annualConsumptionKwh: 24_000,
      monthlyProductionKwh: monthlyProduction,
      monthlyConsumptionKwh: monthlyConsumption,
    });
    const withoutMonthly = resolveSelfConsumptionShare({
      annualProductionKwh: monthlyProduction.reduce((a, b) => a + b, 0),
      annualConsumptionKwh: 24_000,
    });
    expect(withMonthly.share).toBeLessThanOrEqual(withoutMonthly.share + 1e-12);
    expect(withMonthly.monthlyUpperBound).not.toBeNull();
    // The overlap bound itself is never presented as the actual rate.
    expect(withMonthly.share).toBeLessThanOrEqual(withMonthly.monthlyUpperBound!);
  });
});

describe("randomised invariants", () => {
  it("holds over 10 000 random cases", { timeout: 60_000 }, () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 10_000; i += 1) {
      const consumption = rnd() < 0.02 ? 0 : rnd() * 60_000;
      const production = rnd() < 0.02 ? 0 : rnd() * 80_000;
      const userSet = rnd() < 0.2;
      const userShare = rnd();
      const estimate = resolveSelfConsumptionShare({
        annualProductionKwh: production,
        annualConsumptionKwh: consumption,
        userShare,
        userSet,
      });
      expect(Number.isFinite(estimate.share)).toBe(true);
      expect(estimate.share).toBeGreaterThanOrEqual(0);
      expect(estimate.share).toBeLessThanOrEqual(1);
      if (userSet) expect(estimate.share).toBeCloseTo(userShare, 10);

      const split = splitProduction(production, estimate.share, consumption);
      expect(split.selfConsumptionKwh).toBeGreaterThanOrEqual(0);
      expect(split.selfConsumptionKwh).toBeLessThanOrEqual(production + 1e-9);
      expect(split.selfConsumptionKwh).toBeLessThanOrEqual(consumption + 1e-9);
      expect(split.exportedKwh).toBeGreaterThanOrEqual(-1e-9);
      expect(split.selfConsumptionKwh + split.exportedKwh).toBeCloseTo(production, 6);
    }
  });
});

describe("lifetime consistency", () => {
  const resolver = (productionKwh: number) =>
    resolveSelfConsumptionShare({
      annualProductionKwh: productionKwh,
      annualConsumptionKwh: CONSUMPTION,
    }).share;

  it("re-resolves the share as production degrades and keeps the balance", () => {
    const projection = buildLifetimeProjection({
      firstYearProductionKwh: 12_000,
      selfConsumptionShare: resolver(12_000),
      selfConsumptionShareForProduction: resolver,
      annualConsumptionKwh: CONSUMPTION,
      selfConsumedValuePerKwh: 1.5,
      exportValuePerKwh: 0.5,
    });
    const y = (year: number) => projection.years[year - 1]!;
    for (const year of [1, 10, 30]) {
      const row = y(year);
      expect(row.selfConsumptionKwh + row.exportedKwh).toBeCloseTo(row.productionKwh, 6);
      expect(row.selfConsumptionKwh).toBeLessThanOrEqual(CONSUMPTION + 1e-9);
    }
    // Less production later on means a slightly higher self-consumption rate.
    expect(y(30).selfConsumptionKwh / y(30).productionKwh).toBeGreaterThan(
      y(1).selfConsumptionKwh / y(1).productionKwh,
    );
  });

  it("keeps a user override constant across the period", () => {
    const projection = buildLifetimeProjection({
      firstYearProductionKwh: 12_000,
      selfConsumptionShare: 0.42,
      annualConsumptionKwh: CONSUMPTION,
      selfConsumedValuePerKwh: 1.5,
      exportValuePerKwh: 0.5,
    });
    for (const year of [1, 10, 30]) {
      const row = projection.years[year - 1]!;
      expect(row.selfConsumptionKwh / row.productionKwh).toBeCloseTo(0.42, 6);
    }
  });
});
