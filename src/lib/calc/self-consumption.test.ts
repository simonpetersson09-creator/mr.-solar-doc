import { describe, expect, it } from "vitest";

import { splitProduction, summariseSelfConsumption } from "./self-consumption";
import { buildLifetimeProjection } from "./degradation";

/**
 * Physical invariants that must hold for every possible input. A household can
 * never self-consume more than it uses, nor more than the array produces.
 */
function expectInvariants(params: {
  selfConsumedKwh: number;
  exportedKwh: number;
  productionKwh: number;
  consumptionKwh: number;
}) {
  const { selfConsumedKwh, exportedKwh, productionKwh, consumptionKwh } = params;
  expect(selfConsumedKwh).toBeLessThanOrEqual(consumptionKwh + 1e-9);
  expect(selfConsumedKwh).toBeLessThanOrEqual(productionKwh + 1e-9);
  expect(selfConsumedKwh).toBeGreaterThanOrEqual(0);
  expect(exportedKwh).toBeCloseTo(productionKwh - selfConsumedKwh, 9);
  expect(exportedKwh).toBeGreaterThanOrEqual(-1e-9);
}

describe("splitProduction", () => {
  it("applies the requested share when consumption is not limiting", () => {
    const split = splitProduction(10_000, 0.5, 20_000);
    expect(split.selfConsumptionKwh).toBe(5_000);
    expect(split.exportedKwh).toBe(5_000);
    expect(split.selfConsumptionShare).toBeCloseTo(0.5, 9);
  });

  it("caps the energy amount, not just the percentage, when production exceeds consumption", () => {
    // 50 % of 20 000 kWh would be 10 000 kWh, but the site only uses 3 000 kWh.
    const split = splitProduction(20_000, 0.5, 3_000);
    expect(split.selfConsumptionKwh).toBe(3_000);
    expect(split.exportedKwh).toBe(17_000);
    expect(split.selfConsumptionShare).toBeCloseTo(0.15, 9);
    expectInvariants({ ...split2fields(split), productionKwh: 20_000, consumptionKwh: 3_000 });
  });

  it("handles the extreme case from the audit (1 kWh consumption)", () => {
    const split = splitProduction(9_660, 0.5, 1);
    expect(split.selfConsumptionKwh).toBe(1);
    expectInvariants({ ...split2fields(split), productionKwh: 9_660, consumptionKwh: 1 });
  });

  it("never self-consumes more than the array produces", () => {
    const split = splitProduction(1_000, 1, 50_000);
    expect(split.selfConsumptionKwh).toBe(1_000);
    expect(split.exportedKwh).toBe(0);
  });

  it("stays safe for zero production and zero consumption", () => {
    expect(splitProduction(0, 0.5, 5_000).selfConsumptionKwh).toBe(0);
    const none = splitProduction(5_000, 0.5, 0);
    expect(none.selfConsumptionKwh).toBe(0);
    expect(none.exportedKwh).toBe(5_000);
  });

  it("keeps the old behaviour when no consumption cap is supplied", () => {
    const split = splitProduction(10_000, 0.5);
    expect(split.selfConsumptionKwh).toBe(5_000);
  });
});

describe("summariseSelfConsumption", () => {
  it("never reports a self-sufficiency rate above 100 %", () => {
    const production = 20_000;
    const consumption = 3_000;
    const split = splitProduction(production, 0.5, consumption);
    const summary = summariseSelfConsumption({
      split,
      annualProductionKwh: production,
      annualConsumptionKwh: consumption,
      source: "standard-assumption",
    });
    expect(summary.selfSufficiencyRate).toBeLessThanOrEqual(1);
    expect(summary.selfConsumptionRate).toBeLessThanOrEqual(1);
    expect(summary.selfSufficiencyRate).toBeCloseTo(1, 9);
  });

  it("keeps both rates bounded across a wide sweep", () => {
    for (const production of [0, 500, 5_000, 20_000, 100_000]) {
      for (const consumption of [1, 100, 4_000, 25_000]) {
        for (const share of [0, 0.25, 0.5, 1]) {
          const split = splitProduction(production, share, consumption);
          const summary = summariseSelfConsumption({
            split,
            annualProductionKwh: production,
            annualConsumptionKwh: consumption,
            source: "standard-assumption",
          });
          expect(summary.selfConsumptionRate).toBeLessThanOrEqual(1);
          expect(summary.selfSufficiencyRate).toBeLessThanOrEqual(1);
          expectInvariants({
            ...split2fields(split),
            productionKwh: production,
            consumptionKwh: consumption,
          });
        }
      }
    }
  });
});

describe("buildLifetimeProjection", () => {
  it("applies the same physical cap in every year of the 30-year model", () => {
    const projection = buildLifetimeProjection({
      firstYearProductionKwh: 20_000,
      selfConsumptionShare: 0.5,
      annualConsumptionKwh: 3_000,
      selfConsumedValuePerKwh: 1.5,
      exportValuePerKwh: 0.6,
    });
    expect(projection.years).toHaveLength(30);
    for (const year of projection.years) {
      expectInvariants({
        selfConsumedKwh: year.selfConsumptionKwh,
        exportedKwh: year.exportedKwh,
        productionKwh: year.productionKwh,
        consumptionKwh: 3_000,
      });
    }
  });

  it("keeps the uncapped case unchanged", () => {
    const projection = buildLifetimeProjection({
      firstYearProductionKwh: 10_000,
      selfConsumptionShare: 0.5,
      annualConsumptionKwh: 40_000,
      selfConsumedValuePerKwh: 1.5,
      exportValuePerKwh: 0.6,
    });
    expect(projection.years[0]!.selfConsumptionKwh).toBeCloseTo(5_000, 6);
  });
});

function split2fields(split: { selfConsumptionKwh: number; exportedKwh: number }) {
  return { selfConsumedKwh: split.selfConsumptionKwh, exportedKwh: split.exportedKwh };
}
