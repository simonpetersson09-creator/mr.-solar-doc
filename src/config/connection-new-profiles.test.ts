/**
 * GOLDEN tests for the four national profiles verified in this release:
 * IE (MIC, kVA), HR (priključna snaga, kW), LV (connection current, A) and
 * LT (leistinoji naudoti galia, kW).
 *
 * They pin the two things that must never drift: the published national
 * levels, and how each unit is turned into an AC ceiling.
 */

import { describe, expect, it } from "vitest";
import {
  GENERIC_CONNECTION_CONFIGS,
  getConnectionConfig,
  requiresGridConfirmation,
} from "./connections";
import {
  connectionCapacityAmount,
  connectionCapacityToMaxAcPowerKw,
  connectionCapacityUnit,
} from "./connection-capacity";
import { calculateSolarSystem } from "@/lib/calc/engine";
import { GridTooSmallError } from "@/lib/calc/engine";
import { MARKETS } from "./markets";
import type { CalculationInput } from "@/lib/calc/types";

const kw = (countryCode: string, amount: number) => {
  const option = getConnectionConfig(countryCode).connectionOptions.find(
    (o) => connectionCapacityAmount(o.capacity) === amount,
  );
  expect(option, `${countryCode} is missing the ${amount} level`).toBeDefined();
  return connectionCapacityToMaxAcPowerKw(option!.capacity);
};

describe("IE — Maximum Import Capacity in kVA", () => {
  const config = getConnectionConfig("IE");

  it("is a verified, country-specific kVA profile with no confirmation gate", () => {
    expect(config.status).toBe("verified");
    expect(config.verified).toBe(true);
    expect(config.source).toBe("verified");
    expect(config.capacityInputType).toBe("contracted-kva");
    expect(connectionCapacityUnit(config.capacityInputType)).toBe("kVA");
    expect(config.localTerm).toBe("Maximum Import Capacity (MIC)");
    expect(requiresGridConfirmation(config)).toBe(false);
  });

  it("offers exactly the ESB Networks domestic levels", () => {
    expect(config.connectionOptions.map((o) => connectionCapacityAmount(o.capacity))).toEqual([
      12, 16,
    ]);
  });

  it("uses the kVA total directly (cos φ = 1.0), never an ampere formula", () => {
    expect(kw("IE", 12)).toBeCloseTo(12, 9);
    expect(kw("IE", 16)).toBeCloseTo(16, 9);
    for (const option of config.connectionOptions) {
      expect(option.capacity.serviceType).toBeUndefined();
      expect(option.capacity.voltageV).toBeUndefined();
      expect(option.phasePrefix).toBeUndefined();
    }
    // Grid metadata still exists for UI/PDF only.
    expect(config.defaultServiceType).toBe("single-phase");
    expect(config.defaultVoltage).toBe(230);
    expect(config.defaultFrequencyHz).toBe(50);
  });
});

describe("HR — priključna snaga in kW", () => {
  const config = getConnectionConfig("HR");

  it("is verified, kW based and needs no confirmation", () => {
    expect(config.status).toBe("verified");
    expect(config.capacityInputType).toBe("contracted-kw");
    expect(config.localTerm).toBe("Priključna snaga");
    expect(requiresGridConfirmation(config)).toBe(false);
    expect(config.defaultConnection).toBeNull();
  });

  it("lists the HEP ODS single- and three-phase levels", () => {
    expect(config.connectionOptions.map((o) => connectionCapacityAmount(o.capacity))).toEqual([
      4.6, 5.75, 7.36, 9.2, 11.5, 11.04, 13.8, 17.25, 22,
    ]);
  });

  it.each([4.6, 11.5, 11.04, 22])("maxAcKw === selected %s kW", (value) => {
    expect(kw("HR", value)).toBe(value);
  });

  it("keeps 230/400 V 50 Hz as grid metadata only", () => {
    expect(config.defaultServiceType).toBe("three-phase");
    expect(config.defaultVoltage).toBe(400);
    expect(config.defaultFrequencyHz).toBe(50);
  });
});

describe("LV — connection current in amperes", () => {
  const config = getConnectionConfig("LV");

  it("is no longer a generic profile", () => {
    expect(GENERIC_CONNECTION_CONFIGS["LV"]).toBeUndefined();
    expect(config.status).toBe("verified");
    expect(config.source).toBe("verified");
    expect(requiresGridConfirmation(config)).toBe(false);
    expect(config.capacityInputType).toBe("amperage");
    expect(config.localTerm).toBe("Pieslēguma strāva");
  });

  it("lists the Sadales tīkls 1-phase and 3-phase steps", () => {
    expect(config.connectionOptions.map((o) => connectionCapacityAmount(o.capacity))).toEqual([
      16, 20, 25, 32, 16, 20, 25, 32, 40, 50, 63,
    ]);
  });

  it.each([
    [1, 16, (230 * 16) / 1000],
    [1, 32, (230 * 32) / 1000],
    [3, 16, (Math.sqrt(3) * 400 * 16) / 1000],
    [3, 63, (Math.sqrt(3) * 400 * 63) / 1000],
  ])("%s-phase %s A matches the independent electrical reference", (phases, amps, expected) => {
    const option = config.connectionOptions.find(
      (o) =>
        connectionCapacityAmount(o.capacity) === amps &&
        o.capacity.serviceType === (phases === 3 ? "three-phase" : "single-phase"),
    )!;
    expect(connectionCapacityToMaxAcPowerKw(option.capacity)).toBeCloseTo(expected, 9);
  });
});

describe("LT — leistinoji naudoti galia in kW", () => {
  const config = getConnectionConfig("LT");

  it("is no longer a generic profile", () => {
    expect(GENERIC_CONNECTION_CONFIGS["LT"]).toBeUndefined();
    expect(config.status).toBe("verified");
    expect(requiresGridConfirmation(config)).toBe(false);
    expect(config.capacityInputType).toBe("contracted-kw");
    expect(config.localTerm).toBe("Leistinoji naudoti galia");
  });

  it("lists the ESO levels", () => {
    expect(config.connectionOptions.map((o) => connectionCapacityAmount(o.capacity))).toEqual([
      3, 4, 5, 7, 9, 11, 14, 18, 22, 28, 35, 45, 60,
    ]);
  });

  it.each([3, 5, 7, 11, 60])("maxAcKw === selected %s kW", (value) => {
    expect(kw("LT", value)).toBe(value);
  });
});

describe("only CH remains generic", () => {
  it("keeps the confirmation gate for CH and for unknown countries", () => {
    expect(Object.keys(GENERIC_CONNECTION_CONFIGS)).toEqual(["CH"]);
    expect(getConnectionConfig("CH").status).toBe("generic");
    expect(requiresGridConfirmation(getConnectionConfig("CH"))).toBe(true);
    expect(requiresGridConfirmation(getConnectionConfig("ZZ"))).toBe(true);
  });
});

/* ---------------------- full chain through the engine --------------------- */

const MONTHLY_KWH_PER_KWP = [22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5];

function buildInput(countryCode: string, maxAcPowerKw: number): CalculationInput {
  return {
    location: {
      address: "Test 1",
      latitude: 55,
      longitude: 14,
      countryCode,
      region: "Test",
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
    electrical: { maxAcPowerKw },
    economics: {
      selfConsumedValuePerKwh: 0.25,
      exportValuePerKwh: 0.06,
      currency: "EUR",
    },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: MARKETS["SE"]!.inverterSizesKw,
  };
}

describe("every new profile option survives the full engine chain", () => {
  const countries = ["IE", "HR", "LV", "LT"];
  for (const country of countries) {
    for (const option of getConnectionConfig(country).connectionOptions) {
      const amount = connectionCapacityAmount(option.capacity);
      const maxAc = connectionCapacityToMaxAcPowerKw(option.capacity);
      it(`${country} ${amount}${connectionCapacityUnit(option.capacity.type)} -> finite sizing`, () => {
        expect(Number.isFinite(maxAc)).toBe(true);
        let result;
        try {
          result = calculateSolarSystem(buildInput(country, maxAc));
        } catch (error) {
          // A connection too small for the smallest inverter is a controlled
          // domain outcome, never a crash.
          expect(error).toBeInstanceOf(GridTooSmallError);
          return;
        }
        expect(Number.isFinite(result.inverterKw)).toBe(true);
        expect(Number.isFinite(result.installedKwp)).toBe(true);
        expect(result.inverterKw).toBeLessThanOrEqual(result.pvPowerLimitKw + 1e-9);
        expect(result.installedKwp).toBeGreaterThan(0);
        expect(result.dcAcRatio).toBeCloseTo(result.installedKwp / result.inverterKw, 6);
      });
    }
  }
});
