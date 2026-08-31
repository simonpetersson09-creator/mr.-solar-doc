import { describe, expect, it } from "vitest";
import { maxAcPowerKwFor } from "@/config/grid";
import { calculateSolarSystem } from "./engine";
import { MARKETS } from "@/config/markets";
import type { CalculationInput } from "./types";

describe("max AC power from grid profile", () => {
  const cases: Array<[string, Parameters<typeof maxAcPowerKwFor>[0], number]> = [
    ["3-phase 400 V 16 A", { mainFuseAmp: 16, voltageV: 400, phaseCount: 3 }, 11.09],
    ["3-phase 415 V 16 A", { mainFuseAmp: 16, voltageV: 415, phaseCount: 3 }, 11.5],
    ["3-phase 230 V 25 A", { mainFuseAmp: 25, voltageV: 230, phaseCount: 3 }, 9.96],
    ["1-phase 230 V 16 A", { mainFuseAmp: 16, voltageV: 230, phaseCount: 1 }, 3.68],
    ["1-phase 240 V 100 A", { mainFuseAmp: 100, voltageV: 240, phaseCount: 1 }, 24.0],
    ["3-phase custom 480 V 16 A", { mainFuseAmp: 16, voltageV: 480, phaseCount: 3 }, 13.3],
  ];

  it.each(cases)("%s", (_label, input, expected) => {
    expect(maxAcPowerKwFor(input)).toBeCloseTo(expected, 1);
  });
});

const market = MARKETS["SE"]!;

function buildInput(
  electrical: CalculationInput["electrical"],
  annualKwh = 20000,
): CalculationInput {
  return {
    location: { lat: 59.3, lon: 18.1, address: "Test", countryCode: "SE" },
    resource: {
      annualKwhPerKwp: 950,
      monthlyKwhPerKwp: [20, 40, 80, 110, 130, 135, 130, 110, 80, 50, 25, 15],
      orientation: "south",
      tiltDeg: 30,
      dataSource: "PVGIS",
    } as CalculationInput["resource"],
    consumption: { annualKwh, monthlyKwh: null, inputType: "annual", isEstimated: false },
    electrical,
    economics: {
      selfConsumedValuePerKwh: 1.5,
      exportValuePerKwh: 0.6,
      currency: "SEK",
    },
    selfConsumptionShare: null,
    selfConsumptionShareIsUserSet: false,
    acceptedPaybackYears: 10,
    annualPriceChangeRate: 0.02,
    quotePrice: null,
    inverterSizesKw: market.inverterSizesKw,
  } as CalculationInput;
}

describe("grid profile drives the whole calculation chain", () => {
  it("Swedish default (3-phase 400 V) is unchanged by the service-type layer", () => {
    const legacy = calculateSolarSystem(buildInput({ mainFuseAmp: 25, kwPerAmp: market.kwPerAmp }));
    const modern = calculateSolarSystem(
      buildInput({ mainFuseAmp: 25, gridVoltageV: 400, gridPhases: 3, gridFrequencyHz: 50 }),
    );
    expect(modern.maxAcPowerKw).toBeCloseTo(25 * Math.sqrt(3) * 0.4, 6);
    expect(modern.inverterKw).toBe(legacy.inverterKw);
    expect(modern.installedKwp).toBeCloseTo(legacy.installedKwp, 1);
  });

  it("lower grid limit shrinks inverter and array", () => {
    const threePhase = calculateSolarSystem(
      buildInput({ mainFuseAmp: 16, gridVoltageV: 400, gridPhases: 3 }),
    );
    const singlePhase = calculateSolarSystem(
      buildInput({ mainFuseAmp: 16, gridVoltageV: 230, gridPhases: 1 }),
    );
    expect(singlePhase.maxAcPowerKw).toBeCloseTo(3.68, 2);
    expect(singlePhase.inverterKw).toBeLessThanOrEqual(singlePhase.maxAcPowerKw);
    expect(singlePhase.inverterKw).toBeLessThan(threePhase.inverterKw);
    expect(singlePhase.installedKwp).toBeLessThan(threePhase.installedKwp);
  });

  it("higher voltage raises the AC limit for the same fuse", () => {
    const v400 = calculateSolarSystem(buildInput({ mainFuseAmp: 16, gridVoltageV: 400, gridPhases: 3 }));
    const v415 = calculateSolarSystem(buildInput({ mainFuseAmp: 16, gridVoltageV: 415, gridPhases: 3 }));
    expect(v415.maxAcPowerKw).toBeGreaterThan(v400.maxAcPowerKw);
    expect(v415.maxAcPowerKw).toBeCloseTo(11.5, 1);
  });

  it("custom voltage flows through untouched and is reported by the result view", () => {
    const result = calculateSolarSystem(buildInput({ mainFuseAmp: 16, gridVoltageV: 480, gridPhases: 3 }));
    expect(result.maxAcPowerKw).toBeCloseTo(13.3, 1);
    expect(result.grid.voltageV).toBe(480);
    expect(result.grid.serviceType).toBe("three-phase");
    expect(result.presentation.maxAcPowerKw).toBeCloseTo(13.3, 1);
  });

  it("DC/AC ratio is computed against the chosen inverter", () => {
    const result = calculateSolarSystem(buildInput({ mainFuseAmp: 16, gridVoltageV: 230, gridPhases: 1 }));
    expect(result.dcAcRatio).toBeCloseTo(result.installedKwp / result.inverterKw, 6);
    expect(result.installedKwp).toBeLessThanOrEqual(result.maxAcPowerKw * 1.3 + 1e-6);
  });

  it("frequency never affects the power calculation", () => {
    const a = calculateSolarSystem(
      buildInput({ mainFuseAmp: 20, gridVoltageV: 230, gridPhases: 1, gridFrequencyHz: 50 }),
    );
    const b = calculateSolarSystem(
      buildInput({ mainFuseAmp: 20, gridVoltageV: 230, gridPhases: 1, gridFrequencyHz: 60 }),
    );
    expect(b.maxAcPowerKw).toBeCloseTo(a.maxAcPowerKw, 9);
    expect(b.grid.frequencyHz).toBe(60);
  });
});
