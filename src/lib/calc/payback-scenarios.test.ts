import { describe, expect, it } from "vitest";
import { buildPaybackScenarios, calculateMaxInvestment } from "./payback";
import { MAX_PAYBACK_YEARS, MIN_PAYBACK_YEARS } from "@/config/constants";

const values = Array.from({ length: 30 }, (_, i) => 8000 * 1.03 ** i);

function scenarios(years: number) {
  return buildPaybackScenarios({
    annualEconomicValue: 8000,
    acceptedPaybackYears: years,
    annualValues: values,
    minYears: MIN_PAYBACK_YEARS,
    maxYears: MAX_PAYBACK_YEARS,
  });
}

describe("payback scenarios", () => {
  it("returns selected -2 / selected / selected +2", () => {
    const result = scenarios(12);
    expect(result.map((s) => s.paybackYears)).toEqual([10, 12, 14]);
    expect(result.filter((s) => s.selected).map((s) => s.paybackYears)).toEqual([12]);
  });

  it("uses the same model as the main investment calculation", () => {
    for (const s of scenarios(12)) {
      const direct = calculateMaxInvestment(8000, s.paybackYears, null, values);
      expect(s.maxInvestment).toBeCloseTo(direct.maxInvestment, 6);
      expect(s.maxInvestmentRounded).toBe(direct.maxInvestmentRounded);
    }
  });

  it("is monotonically increasing with payback time", () => {
    const result = scenarios(12);
    expect(result[0]!.maxInvestment).toBeLessThan(result[1]!.maxInvestment);
    expect(result[1]!.maxInvestment).toBeLessThan(result[2]!.maxInvestment);
  });

  it("respects the allowed payback range at the bounds", () => {
    const low = scenarios(MIN_PAYBACK_YEARS);
    expect(low.map((s) => s.paybackYears)).toEqual([MIN_PAYBACK_YEARS, MIN_PAYBACK_YEARS + 2]);
    expect(low[0]!.selected).toBe(true);

    const high = scenarios(MAX_PAYBACK_YEARS);
    expect(high.map((s) => s.paybackYears)).toEqual([MAX_PAYBACK_YEARS - 2, MAX_PAYBACK_YEARS]);
    expect(high[1]!.selected).toBe(true);

    const nearLow = scenarios(MIN_PAYBACK_YEARS + 1);
    expect(nearLow.map((s) => s.paybackYears)).toEqual([
      MIN_PAYBACK_YEARS,
      MIN_PAYBACK_YEARS + 1,
      MIN_PAYBACK_YEARS + 3,
    ]);
  });
});
