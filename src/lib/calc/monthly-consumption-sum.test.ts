import { describe, expect, it } from "vitest";
import { validateCalculationInput } from "./validation";
import type { CalculationInput } from "./types";

const MONTHLY_KWH_PER_KWP = [20, 40, 80, 120, 150, 160, 155, 130, 90, 50, 25, 20];

function makeInput(monthlyKwh: number[] | null, annualKwh = 12_000): CalculationInput {
  return {
    location: { latitude: 59.3, longitude: 18.1, countryCode: "SE" },
    resource: {
      annualKwhPerKwp: 1040,
      monthlyKwhPerKwp: MONTHLY_KWH_PER_KWP,
      orientation: "south",
      tiltDegrees: 30,
      orientationAssumed: false,
      tiltAssumed: false,
      dataSource: "test",
      calculationDate: "2026-09-13",
    },
    consumption: { annualKwh, monthlyKwh },
    electrical: { maxAcPowerKw: 17.25, mainFuseAmp: 25 },
    economics: {
      currency: "SEK",
      selfConsumedValuePerKwh: 1.44,
      exportValuePerKwh: 0.6,
    },
    selfConsumptionShare: 0.4,
    acceptedPaybackYears: 12,
  } as unknown as CalculationInput;
}

const codes = (input: CalculationInput) =>
  validateCalculationInput(input).map((issue) => issue.code);

describe("monthly consumption sum guard", () => {
  it("accepts a monthly series that matches the annual figure", () => {
    expect(codes(makeInput(Array.from({ length: 12 }, () => 1_000)))).not.toContain(
      "monthly-consumption-sum-mismatch",
    );
  });

  it("accepts per-month rounding drift", () => {
    // 12 x 999 = 11 988 kWh, 0.1 % below the annual figure
    expect(codes(makeInput(Array.from({ length: 12 }, () => 999)))).not.toContain(
      "monthly-consumption-sum-mismatch",
    );
  });

  it("rejects a monthly series summing to half the annual figure", () => {
    expect(codes(makeInput(Array.from({ length: 12 }, () => 500)))).toContain(
      "monthly-consumption-sum-mismatch",
    );
  });

  it("rejects twelve explicit zeros against a positive annual figure", () => {
    expect(codes(makeInput(Array.from({ length: 12 }, () => 0)))).toContain(
      "monthly-consumption-sum-mismatch",
    );
  });

  it("does not flag anything when no monthly series is given", () => {
    expect(codes(makeInput(null))).not.toContain("monthly-consumption-sum-mismatch");
  });
});
