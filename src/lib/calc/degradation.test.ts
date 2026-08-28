import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANNUAL_SOLAR_DEGRADATION,
  LONG_TERM_CALCULATION_YEARS,
} from "@/config/constants";
import {
  buildLifetimeProjection,
  performanceFactorForYear,
  productionForYear,
} from "./degradation";

const FIRST_YEAR = 4128;

describe("production degradation", () => {
  it("keeps year 1 at 100 % of the first-year production", () => {
    expect(productionForYear(FIRST_YEAR, 1)).toBe(FIRST_YEAR);
    expect(performanceFactorForYear(1)).toBe(1);
  });

  it("uses geometric degradation", () => {
    expect(performanceFactorForYear(2)).toBeCloseTo(0.995, 6);
    expect(performanceFactorForYear(20)).toBeCloseTo(0.9091, 3);
    expect(performanceFactorForYear(30)).toBeCloseTo(0.8646, 3);
    expect(productionForYear(FIRST_YEAR, 10)).toBeCloseTo(3946, 0);
    expect(productionForYear(FIRST_YEAR, 30)).toBeCloseTo(3570, 0);
  });

  it("uses 0.5 % per year as the central assumption", () => {
    expect(DEFAULT_ANNUAL_SOLAR_DEGRADATION).toBe(0.005);
    expect(LONG_TERM_CALCULATION_YEARS).toBe(30);
  });
});

describe("lifetime projection", () => {
  const projection = buildLifetimeProjection({
    firstYearProductionKwh: FIRST_YEAR,
    selfConsumptionShare: 0.35,
    selfConsumedValuePerKwh: 1.8,
    exportValuePerKwh: 0.6,
  });

  it("sums the yearly economic values instead of multiplying year 1", () => {
    const sum = projection.years.reduce((s, y) => s + y.economicValue, 0);
    expect(projection.totalEconomicValue).toBeCloseTo(sum, 6);
    const yearOne = projection.years[0]!.economicValue;
    expect(projection.totalEconomicValue).toBeLessThan(yearOne * 30);
  });

  it("holds electricity values constant", () => {
    expect(projection.annualPriceChangeRate).toBe(0);
    const perKwhYear1 =
      projection.years[0]!.economicValue / projection.years[0]!.productionKwh;
    const perKwhYear30 =
      projection.years[29]!.economicValue / projection.years[29]!.productionKwh;
    expect(perKwhYear30).toBeCloseTo(perKwhYear1, 9);
  });

  it("propagates a changed degradation rate through all years", () => {
    const doubled = buildLifetimeProjection({
      firstYearProductionKwh: FIRST_YEAR,
      selfConsumptionShare: 0.35,
      selfConsumedValuePerKwh: 1.8,
      exportValuePerKwh: 0.6,
      annualDegradationRate: 0.01,
    });
    expect(doubled.finalYearPerformanceFactor).toBeCloseTo(Math.pow(0.99, 29), 6);
    expect(doubled.totalEconomicValue).toBeLessThan(projection.totalEconomicValue);
    expect(doubled.totalProductionKwh).toBeLessThan(projection.totalProductionKwh);
  });
});
