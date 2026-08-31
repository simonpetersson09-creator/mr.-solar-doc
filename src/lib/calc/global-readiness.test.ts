import { connectionCapacityAmount } from "@/config/connection-capacity";
import { describe, expect, it } from "vitest";
import { maxAcPowerKwFor, SERVICE_TYPE_AC_FACTOR, splitPhaseLineToNeutral } from "@/config/grid";
import { getConnectionConfig, hasVerifiedConnectionConfig } from "@/config/connections";
import { getCountryConfig, resolveEconomicsDefaults, currencyForCountry } from "@/config/countries";
import { MARKETS } from "@/config/markets";
import { calculateSolarSystem } from "./engine";
import type { CalculationInput, EconomicsInput } from "./types";

/* ------------------------------ split-phase ------------------------------ */

describe("split-phase service (US/CA 120/240 V)", () => {
  const cases: Array<[number, number]> = [
    [100, 24],
    [200, 48],
    [60, 14.4],
  ];

  it.each(cases)("120/240 V, %i A -> %f kW", (amps, expected) => {
    expect(
      maxAcPowerKwFor({ mainFuseAmp: amps, voltageV: 240, serviceType: "split-phase" }),
    ).toBeCloseTo(expected, 6);
  });

  it("uses the 240 V line-to-line voltage, never the 120 V leg", () => {
    const power = maxAcPowerKwFor({
      mainFuseAmp: 200,
      voltageV: 240,
      serviceType: "split-phase",
      lineToNeutralVoltageV: 120,
    });
    expect(power).toBe(48);
    expect(power).not.toBeCloseTo(120 * 200 / 1000, 6);
  });

  it("never applies sqrt(3)", () => {
    expect(SERVICE_TYPE_AC_FACTOR["split-phase"]).toBe(1);
    expect(
      maxAcPowerKwFor({ mainFuseAmp: 100, voltageV: 240, serviceType: "split-phase" }),
    ).not.toBeCloseTo(Math.sqrt(3) * 240 * 100 / 1000, 3);
  });

  it("derives the line-to-neutral voltage from the service voltage", () => {
    expect(splitPhaseLineToNeutral(240)).toBe(120);
  });
});

/* --------------------------- connection configs -------------------------- */

describe("connection configuration", () => {
  it("Sweden is verified and offers Swedish fuse sizes", () => {
    expect(hasVerifiedConnectionConfig("SE")).toBe(true);
    expect(getConnectionConfig("SE").connectionOptions.map((o) => connectionCapacityAmount(o.capacity))).toEqual([
      16, 20, 25, 35, 50, 63,
    ]);
  });

  it.each(["US", "CA"])("%s is split-phase 120/240 V 60 Hz", (code) => {
    const config = getConnectionConfig(code);
    expect(config.verified).toBe(true);
    expect(config.source).toBe("verified");
    expect(config.defaultServiceType).toBe("split-phase");
    expect(config.defaultVoltage).toBe(240);
    expect(config.defaultLineToNeutralVoltage).toBe(120);
    expect(config.defaultFrequencyHz).toBe(60);
    expect(config.connectionOptions.map((o) => connectionCapacityAmount(o.capacity))).toEqual([60, 100, 125, 150, 200, 400]);
    // No service rating is preselected: we cannot know the user's panel.
    expect(config.defaultConnection).toBeNull();
  });

  it("unknown country falls back without Swedish fuse options", () => {
    const config = getConnectionConfig("ZZ");
    expect(config.verified).toBe(false);
    expect(config.source).toBe("fallback");
    expect(config.connectionOptions).toHaveLength(0);
  });
});

/* --------------------------- economics fallback -------------------------- */

describe("country economics fallback", () => {
  it("keeps verified Swedish defaults", () => {
    const resolved = resolveEconomicsDefaults("SE");
    expect(resolved.currencyCode).toBe("SEK");
    expect(resolved.selfConsumedValuePerKwh).toBe(MARKETS["SE"]!.selfConsumedElectricityValue);
    expect(resolved.valuesMissing).toBe(false);
  });

  it("never borrows Swedish prices for an unknown country", () => {
    const resolved = resolveEconomicsDefaults("ZZ");
    expect(resolved.selfConsumedValuePerKwh).toBeNull();
    expect(resolved.exportValuePerKwh).toBeNull();
    expect(resolved.installationCostPerKwp).toBeNull();
    expect(resolved.gridCompensationPerKwh).toBeNull();
    expect(resolved.valuesMissing).toBe(true);
  });

  it("user-provided economics beat country defaults", () => {
    const resolved = resolveEconomicsDefaults("SE", {
      selfConsumedValuePerKwh: 2.4,
      exportValuePerKwh: 0,
    });
    expect(resolved.selfConsumedValuePerKwh).toBe(2.4);
    // 0 is a real user value and must not be replaced by the country default.
    expect(resolved.exportValuePerKwh).toBe(0);
  });

  it("grid compensation is only available where the country enables it", () => {
    expect(getCountryConfig("SE").economics.gridCompensation.enabled).toBe(true);
    expect(getCountryConfig("US").economics.gridCompensation.enabled).toBe(false);
    expect(resolveEconomicsDefaults("US").gridCompensationPerKwh).toBeNull();
  });

  it("uses the correct currency per country and a neutral code when unknown", () => {
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("CA")).toBe("CAD");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("AU")).toBe("AUD");
    expect(currencyForCountry("SE")).toBe("SEK");
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(getCountryConfig("ZZ").economics.currencyCode).not.toBe("SEK");
  });
});

/* ----------------------------- null economics ---------------------------- */

const MONTHLY_KWH_PER_KWP = [22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5];

function buildInput(economics: EconomicsInput, countryCode = "US"): CalculationInput {
  return {
    location: {
      address: "1 Test Street",
      latitude: 40.7,
      longitude: -74,
      countryCode,
      region: "NY",
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
    consumption: { annualKwh: 12_000, monthlyKwh: null },
    electrical: { mainFuseAmp: 100, gridVoltageV: 240, serviceType: "split-phase" },
    economics,
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: MARKETS["SE"]!.inverterSizesKw,
  };
}

describe("null-safe economics", () => {
  it("technical results still work with no economic data at all", () => {
    const result = calculateSolarSystem(
      buildInput({
        selfConsumedValuePerKwh: null,
        exportValuePerKwh: null,
        installationCostPerKwp: null,
        gridCompensationPerKwh: null,
        gridCompensationEnabled: false,
        currency: "USD",
      }),
    );
    expect(result.installedKwp).toBeGreaterThan(0);
    expect(result.inverterKw).toBeGreaterThan(0);
    expect(result.annualProductionKwh).toBeGreaterThan(0);
    expect(result.maxAcPowerKw).toBeCloseTo(24, 6);
    expect(result.dcAcRatio).toBeGreaterThan(0);
    expect(result.economics.availability.selfConsumedValue).toBe("missing");
    expect(result.economics.availability.exportValue).toBe("missing");
    expect(result.economics.availability.installationCost).toBe("missing");
    expect(result.economics.availability.gridCompensation).toBe("not-applicable");
    expect(result.economics.availability.totalsComplete).toBe(false);
  });

  it("partial economics: self-consumption known, export unknown", () => {
    const result = calculateSolarSystem(
      buildInput({
        selfConsumedValuePerKwh: 0.18,
        exportValuePerKwh: null,
        currency: "USD",
      }),
    );
    expect(result.economics.availability.selfConsumedValue).toBe("available");
    expect(result.economics.availability.exportValue).toBe("missing");
    expect(result.economics.availability.totalsComplete).toBe(false);
    expect(result.economics.selfConsumptionValue).toBeGreaterThan(0);
    expect(result.notes).toContain("export-value-missing");
  });

  it("distinguishes a verified 0 from a missing value", () => {
    const zero = calculateSolarSystem(
      buildInput({
        selfConsumedValuePerKwh: 0.2,
        exportValuePerKwh: 0,
        gridCompensationEnabled: true,
        gridCompensationPerKwh: 0,
        currency: "USD",
      }),
    );
    expect(zero.economics.availability.exportValue).toBe("available");
    expect(zero.economics.availability.gridCompensation).toBe("available");
    expect(zero.economics.gridCompensationPerKwh).toBe(0);
    expect(zero.economics.availability.totalsComplete).toBe(true);

    const missing = calculateSolarSystem(
      buildInput({
        selfConsumedValuePerKwh: 0.2,
        exportValuePerKwh: null,
        gridCompensationEnabled: true,
        gridCompensationPerKwh: null,
        currency: "USD",
      }),
    );
    expect(missing.economics.availability.gridCompensation).toBe("missing");
    expect(missing.economics.gridCompensationPerKwh).toBeNull();
  });

  it("disabled grid compensation is not applicable, not missing", () => {
    const result = calculateSolarSystem(
      buildInput({
        selfConsumedValuePerKwh: 0.2,
        exportValuePerKwh: 0.05,
        gridCompensationEnabled: false,
        gridCompensationPerKwh: 0.05,
        currency: "USD",
      }),
    );
    expect(result.economics.availability.gridCompensation).toBe("not-applicable");
    expect(result.economics.gridCompensationPerKwh).toBeNull();
  });
});
