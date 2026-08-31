import { describe, expect, it } from "vitest";
import {
  getPvConnectionRules,
  resolvePvPowerLimit,
} from "@/config/pv-connection-rules";
import { calculateSolarSystem } from "@/lib/calc/engine";
import type { CalculationInput } from "@/lib/calc/types";

describe("getPvConnectionRules", () => {
  it("returns verified rules for verified markets", () => {
    expect(getPvConnectionRules("SE")).toMatchObject({ status: "verified", maxPvAcKw: 43.5 });
    expect(getPvConnectionRules("DE")).toMatchObject({ status: "verified", maxPvAcKw: 30 });
  });

  it("never invents a ceiling for unknown countries", () => {
    const rules = getPvConnectionRules("ZZ");
    expect(rules.status).toBe("generic");
    expect(rules.maxPvAcKw).toBeNull();
  });
});

describe("resolvePvPowerLimit", () => {
  it("keeps the two concepts separate and picks the lower ceiling", () => {
    const se = resolvePvPowerLimit({
      connectionCapacityKw: 110,
      rules: getPvConnectionRules("SE"),
    });
    expect(se.maxPvAcKw).toBe(43.5);
    expect(se.binding).toBe("pv-rule");
    expect(se.connectionCapacityKw).toBe(110);
  });

  it("lets a small connection bind even in a high-limit market", () => {
    const se = resolvePvPowerLimit({
      connectionCapacityKw: 11,
      rules: getPvConnectionRules("SE"),
    });
    expect(se.maxPvAcKw).toBe(11);
    expect(se.binding).toBe("connection-capacity");
  });

  it("does not cap generic markets", () => {
    const zz = resolvePvPowerLimit({
      connectionCapacityKw: 63,
      rules: getPvConnectionRules("ZZ"),
    });
    expect(zz.maxPvAcKw).toBe(63);
    expect(zz.rulesStatus).toBe("generic");
  });
});

function input(overrides: Partial<CalculationInput["electrical"]>): CalculationInput {
  return {
    location: { latitude: 59.3, longitude: 18.1, countryCode: "SE" },
    resource: {
      annualKwhPerKwp: 950,
      monthlyKwhPerKwp: [20, 40, 80, 110, 130, 135, 130, 110, 75, 45, 20, 15],
    },
    consumption: { annualKwh: 60000, monthlyKwh: Array.from({ length: 12 }, () => 5000) },
    electrical: { maxAcPowerKw: 138, ...overrides },
    economics: { currency: "SEK", selfConsumedValuePerKwh: 1.5, exportValuePerKwh: 0.5 },
    selfConsumptionShare: 0.4,
    acceptedPaybackYears: 12,
    annualPriceChangeRate: 0.02,
    inverterSizesKw: [3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60],
  } as CalculationResultInput;
}
type CalculationResultInput = CalculationInput;

describe("engine respects the PV rule ceiling", () => {
  it("caps the inverter at the permitted PV power, not the connection", () => {
    const result = calculateSolarSystem(
      input({ pvPowerLimitKw: 43.5, pvLimitBinding: "pv-rule", pvRulesStatus: "verified" }),
    );
    expect(result.inverterKw).toBeLessThanOrEqual(43.5);
    expect(result.gridConnectionLimitKw).toBe(138);
    expect(result.pvPowerLimitKw).toBe(43.5);
    expect(result.pvLimitBinding).toBe("pv-rule");
    expect(result.notes).toContain("pv-limit-pv-rule");
  });

  it("falls back to the connection capacity without a PV rule", () => {
    const result = calculateSolarSystem(input({ maxAcPowerKw: 17.3 }));
    expect(result.pvPowerLimitKw).toBe(17.3);
    expect(result.pvLimitBinding).toBe("connection-capacity");
    expect(result.inverterKw).toBeLessThanOrEqual(17.3);
  });
});
