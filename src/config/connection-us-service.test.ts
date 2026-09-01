/**
 * US electrical service size — golden tests.
 *
 * The US connection is a split-phase 120/240 V, 60 Hz service. The user states
 * the whole-service panel / main-breaker rating in amperes, and the nominal
 * service capacity must always follow
 *
 *   serviceCapacityKva = 240 V x serviceAmps / 1000
 *
 * never the European three-phase sqrt(3) formula and never the 120 V leg.
 *
 * PV inverter sizing is a SEPARATE rule: the service capacity is only the
 * grid-side ceiling that the existing PV rules are combined with.
 */
import { describe, expect, it } from "vitest";
import { getConnectionConfig } from "./connections";
import {
  connectionCapacityAmount,
  connectionCapacityToMaxAcPowerKw,
  type ConnectionCapacity,
} from "./connection-capacity";
import { calculateSolarSystem, GridTooSmallError } from "@/lib/calc/engine";
import { MARKETS } from "./markets";
import type { CalculationInput } from "@/lib/calc/types";
import { en } from "@/i18n/locales/en";

const US_SPLIT_PHASE = {
  serviceType: "split-phase",
  voltageV: 240,
  lineToNeutralVoltageV: 120,
  frequencyHz: 60,
} as const;

const amps = (amperageA: number): ConnectionCapacity => ({
  type: "amperage",
  amperageA,
  ...US_SPLIT_PHASE,
});

/** Independent reference: 240 V x I, computed outside the app's own helpers. */
const referenceKva = (a: number) => (240 * a) / 1000;

describe("US service size options", () => {
  const config = getConnectionConfig("US");

  it("is a verified split-phase 120/240 V 60 Hz profile", () => {
    expect(config.verified).toBe(true);
    expect(config.status).toBe("verified");
    expect(config.capacityInputType).toBe("amperage");
    expect(config.defaultServiceType).toBe("split-phase");
    expect(config.defaultVoltage).toBe(240);
    expect(config.defaultLineToNeutralVoltage).toBe(120);
    expect(config.defaultFrequencyHz).toBe(60);
    expect(config.localTerm).toBe("Electrical service size");
  });

  it("offers 100/125/150/200/225/400 A and no 60 A", () => {
    const amounts = config.connectionOptions.map((o) => connectionCapacityAmount(o.capacity));
    expect(amounts).toEqual([100, 125, 150, 200, 225, 400]);
    expect(amounts).not.toContain(60);
  });

  it("preselects 200 A", () => {
    const preselected = config.connectionOptions.find((o) => o.id === config.defaultConnection);
    expect(preselected).toBeDefined();
    expect(connectionCapacityAmount(preselected!.capacity)).toBe(200);
  });

  it("never labels the options per phase", () => {
    for (const option of config.connectionOptions) expect(option.phasePrefix).toBeUndefined();
  });

  it("uses US service wording, not the per-phase fuse wording", () => {
    expect(config.questionKey).toBe("fuse.capacity.service.title");
    expect(config.helpTextKey).toBe("fuse.capacity.service.help");
    expect(en.fuse.capacity.service.title).toBe("Electrical service size");
    expect(en.fuse.capacity.service.help).toBe(
      "Find the amp rating on your main breaker or electrical panel.",
    );
    expect(en.fuse.capacity.service.help.toLowerCase()).not.toContain("per phase");
  });
});

describe("US service capacity = 240 V x A (never sqrt(3), never 120 V)", () => {
  it.each([
    [100, 24],
    [125, 30],
    [150, 36],
    [200, 48],
    [225, 54],
    [400, 96],
  ])("%s A = %s kVA", (a, kva) => {
    expect(connectionCapacityToMaxAcPowerKw(amps(a))).toBeCloseTo(kva, 9);
    expect(connectionCapacityToMaxAcPowerKw(amps(a))).toBeCloseTo(referenceKva(a), 9);
  });

  it.each([90, 175, 300])("custom value %s A follows the same rule", (a) => {
    const kw = connectionCapacityToMaxAcPowerKw(amps(a));
    expect(kw).toBeCloseTo(referenceKva(a), 9);
    // Explicitly not the European three-phase formula, nor the 120 V leg.
    expect(kw).not.toBeCloseTo((Math.sqrt(3) * 240 * a) / 1000, 3);
    expect(kw).not.toBeCloseTo((Math.sqrt(3) * 400 * a) / 1000, 3);
    expect(kw).not.toBeCloseTo((120 * a) / 1000, 3);
  });

  it("every shipped US option matches the 240 V reference", () => {
    for (const option of getConnectionConfig("US").connectionOptions) {
      const a = connectionCapacityAmount(option.capacity);
      expect(connectionCapacityToMaxAcPowerKw(option.capacity)).toBeCloseTo(referenceKva(a), 9);
    }
  });
});

/* ------------------------- full engine chain ----------------------------- */

const MONTHLY_KWH_PER_KWP = [30, 50, 85, 115, 140, 145, 150, 135, 105, 70, 35, 25];

function buildInput(maxAcPowerKw: number, pvPowerLimitKw?: number): CalculationInput {
  return {
    location: {
      address: "Test 1",
      latitude: 40,
      longitude: -100,
      countryCode: "US",
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
    electrical: {
      maxAcPowerKw,
      ...(pvPowerLimitKw != null ? { pvPowerLimitKw } : {}),
    },
    economics: {
      selfConsumedValuePerKwh: 0.25,
      exportValuePerKwh: 0.06,
      currency: "USD",
    },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: MARKETS["SE"]!.inverterSizesKw,
  };
}

describe("US chain: service size -> capacity -> AC ceiling -> inverter", () => {
  it.each([100, 125, 150, 200, 225, 400, 90, 175])("%s A sizes without three-phase math", (a) => {
    const maxAc = connectionCapacityToMaxAcPowerKw(amps(a));
    expect(maxAc).toBeCloseTo(referenceKva(a), 9);
    let result;
    try {
      result = calculateSolarSystem(buildInput(maxAc));
    } catch (error) {
      expect(error).toBeInstanceOf(GridTooSmallError);
      return;
    }
    expect(Number.isFinite(result.inverterKw)).toBe(true);
    expect(Number.isFinite(result.installedKwp)).toBe(true);
    expect(result.gridConnectionLimitKw).toBeCloseTo(maxAc, 9);
    expect(result.inverterKw).toBeLessThanOrEqual(result.pvPowerLimitKw + 1e-9);
  });

  it("a separate PV rule still binds below the service capacity", () => {
    // 200 A service = 48 kVA, but a 10 kW PV rule must win: service capacity is
    // never used as the permitted PV power on its own.
    const result = calculateSolarSystem(buildInput(48, 10));
    expect(result.gridConnectionLimitKw).toBeCloseTo(48, 9);
    expect(result.pvPowerLimitKw).toBeCloseTo(10, 9);
    expect(result.inverterKw).toBeLessThanOrEqual(10 + 1e-9);
  });
});

/* --------------------------- no side effects ----------------------------- */

describe("other markets are unchanged", () => {
  it("CA keeps its own ladder including legacy 60 A", () => {
    const amounts = getConnectionConfig("CA").connectionOptions.map((o) =>
      connectionCapacityAmount(o.capacity),
    );
    expect(amounts).toEqual([60, 100, 125, 150, 200, 400]);
    expect(getConnectionConfig("CA").defaultConnection).toBeNull();
    expect(getConnectionConfig("CA").questionKey).toBe("fuse.capacity.amperage.title");
  });

  it.each(["SE", "DE", "FI", "NL", "GB"])("%s keeps per-phase amperage wording", (code) => {
    const config = getConnectionConfig(code);
    expect(config.questionKey).toBe("fuse.capacity.amperage.title");
    expect(config.helpTextKey).toBe("fuse.capacity.amperage.help");
    expect(config.defaultConnection).toBeNull();
  });

  it("SE 25 A on 3N~400 V still uses the three-phase formula", () => {
    const kw = connectionCapacityToMaxAcPowerKw({
      type: "amperage",
      amperageA: 25,
      serviceType: "three-phase",
      voltageV: 400,
      frequencyHz: 50,
    });
    expect(kw).toBeCloseTo((Math.sqrt(3) * 400 * 25) / 1000, 9);
  });
});
