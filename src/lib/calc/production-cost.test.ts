import { describe, expect, it } from "vitest";
import { calculateProductionCost, weightedValuePerKwh } from "./production-cost";

describe("weightedValuePerKwh", () => {
  it("weights self-consumed and exported energy", () => {
    expect(
      weightedValuePerKwh({
        selfConsumptionShare: 0.5,
        selfConsumedValuePerKwh: 1.5,
        exportValuePerKwh: 0.5,
      }),
    ).toBeCloseTo(1.0, 10);
  });

  it("clamps the share and rejects negative prices", () => {
    expect(
      weightedValuePerKwh({
        selfConsumptionShare: 1.4,
        selfConsumedValuePerKwh: 2,
        exportValuePerKwh: -1,
      }),
    ).toBeCloseTo(2, 10);
  });
});

describe("calculateProductionCost", () => {
  const base = {
    investment: 100_000,
    totalProductionKwh: 270_000,
    periodYears: 30,
    selfConsumedValuePerKwh: 1.5,
    exportValuePerKwh: 0.5,
  };

  it("divides investment by total lifetime production", () => {
    const result = calculateProductionCost({ ...base, selfConsumptionShare: 0.5 });
    expect(result.costPerKwh).toBeCloseTo(0.3704, 4);
    expect(result.valuePerKwh).toBeCloseTo(1.0, 10);
    expect(result.differencePerKwh).toBeCloseTo(0.6296, 4);
  });

  it("keeps the production cost independent of the self-consumption share", () => {
    const low = calculateProductionCost({ ...base, selfConsumptionShare: 0.2 });
    const high = calculateProductionCost({ ...base, selfConsumptionShare: 0.9 });
    expect(low.costPerKwh).toBeCloseTo(high.costPerKwh!, 10);
    expect(high.valuePerKwh).toBeGreaterThan(low.valuePerKwh);
  });

  it("returns null when production or investment is missing", () => {
    expect(
      calculateProductionCost({ ...base, totalProductionKwh: 0, selfConsumptionShare: 0.5 })
        .costPerKwh,
    ).toBeNull();
    expect(
      calculateProductionCost({ ...base, investment: 0, selfConsumptionShare: 0.5 }).costPerKwh,
    ).toBeNull();
  });
});
