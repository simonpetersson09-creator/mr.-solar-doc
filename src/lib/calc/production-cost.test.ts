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
    maxInvestment: 100_000,
    totalProductionKwh: 270_000,
    totalEconomicValue: 270_000,
    periodYears: 30,
    selfConsumptionShare: 0.25,
  };

  it("divides the max investment by total lifetime production", () => {
    const result = calculateProductionCost(base);
    expect(result.investmentBasis).toBe("max-investment");
    expect(result.costPerKwh).toBeCloseTo(0.3704, 4);
    expect(result.valuePerKwh).toBeCloseTo(1.0, 10);
    expect(result.differencePerKwh).toBeCloseTo(0.6296, 4);
  });

  it("never lets a quote replace the max investment", () => {
    const result = calculateProductionCost({ ...base, quotePrice: 250_000 });
    expect(result.investment).toBe(100_000);
    expect(result.investmentFromQuote).toBe(false);
    expect(result.costPerKwh).toBeCloseTo(100_000 / 270_000, 10);
    expect(result.quoteCostPerKwh).toBeCloseTo(250_000 / 270_000, 10);
  });

  it("returns null when production or investment is missing", () => {
    expect(calculateProductionCost({ ...base, totalProductionKwh: 0 }).costPerKwh).toBeNull();
    expect(calculateProductionCost({ ...base, maxInvestment: 0 }).costPerKwh).toBeNull();
  });

  it("produces no NaN or Infinity for invalid inputs", () => {
    const result = calculateProductionCost({
      ...base,
      maxInvestment: Number.NaN,
      totalProductionKwh: Number.POSITIVE_INFINITY,
      totalEconomicValue: Number.NaN,
    });
    expect(result.costPerKwh).toBeNull();
    expect(Number.isFinite(result.valuePerKwh)).toBe(true);
    expect(result.differencePerKwh).toBeNull();
  });

  it("uses the same denominator for cost and value", () => {
    const result = calculateProductionCost({ ...base, totalEconomicValue: 405_000 });
    expect(result.valuePerKwh).toBeCloseTo(1.5, 10);
    expect(result.differencePerKwh).toBeCloseTo(1.5 - 100_000 / 270_000, 10);
  });
});
