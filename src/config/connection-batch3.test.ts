/**
 * Golden tests for batch 3 connection profiles: CH, BG, RS, NZ, IL, MX, TR.
 * AU, BR and ZA intentionally stay unverified (regional / dual-unit models).
 *
 * Connection domain only — PV rules, export limits and tariffs are separate.
 */
import { describe, expect, it } from "vitest";
import { getConnectionConfig } from "./connections";
import {
  connectionCapacityToMaxAcPowerKw,
  type ConnectionCapacity,
} from "./connection-capacity";

const SINGLE_230 = { serviceType: "single-phase", voltageV: 230, frequencyHz: 50 } as const;
const THREE_400 = { serviceType: "three-phase", voltageV: 400, frequencyHz: 50 } as const;
const MX_SINGLE_127 = { serviceType: "single-phase", voltageV: 127, frequencyHz: 60 } as const;
const MX_SPLIT_240 = {
  serviceType: "split-phase",
  voltageV: 240,
  lineToNeutralVoltageV: 120,
  frequencyHz: 60,
} as const;
const MX_THREE_220 = { serviceType: "three-phase", voltageV: 220, frequencyHz: 60 } as const;

const amps = (amperageA: number, profile: object): ConnectionCapacity =>
  ({ type: "amperage", amperageA, ...profile }) as ConnectionCapacity;

describe("free-input amperage profiles (CH, NZ, MX)", () => {
  it.each([
    ["CH", "amperage", "three-phase", 400, 50],
    ["NZ", "amperage", "single-phase", 230, 50],
    ["MX", "amperage", "single-phase", 127, 60],
  ])("%s is verified with no invented ladder", (code, inputType, service, voltage, hz) => {
    const config = getConnectionConfig(code);
    expect(config.verified).toBe(true);
    expect(config.status).toBe("verified");
    expect(config.capacityInputType).toBe(inputType);
    expect(config.connectionOptions).toHaveLength(0);
    expect(config.defaultServiceType).toBe(service);
    expect(config.defaultVoltage).toBe(voltage);
    expect(config.defaultFrequencyHz).toBe(hz);
    expect(config.localTerm).toBeTruthy();
  });

  it.each([25, 32, 41])("CH %s A on 3N~400 V = sqrt(3) x 400 x A", (a) => {
    expect(connectionCapacityToMaxAcPowerKw(amps(a, THREE_400))).toBeCloseTo(
      (Math.sqrt(3) * 400 * a) / 1000,
      6,
    );
  });

  it.each([60, 63, 37])("NZ %s A single-phase 230 V = 230 x A", (a) => {
    expect(connectionCapacityToMaxAcPowerKw(amps(a, SINGLE_230))).toBeCloseTo(
      (230 * a) / 1000,
      6,
    );
  });

  it("MX uses the physically correct model per service type — never sqrt(3) on split-phase", () => {
    expect(connectionCapacityToMaxAcPowerKw(amps(50, MX_SINGLE_127))).toBeCloseTo(
      (127 * 50) / 1000,
      6,
    );
    // Two-leg 120/240 V: 240 V x I, no sqrt(3), never the 120 V leg.
    expect(connectionCapacityToMaxAcPowerKw(amps(100, MX_SPLIT_240))).toBeCloseTo(
      (240 * 100) / 1000,
      6,
    );
    expect(connectionCapacityToMaxAcPowerKw(amps(40, MX_THREE_220))).toBeCloseTo(
      (Math.sqrt(3) * 220 * 40) / 1000,
      6,
    );
  });
});

describe("free-input contracted kW profiles (BG, RS, TR)", () => {
  it.each([
    ["BG", "Предоставена мощност"],
    ["RS", "Одобрена снага (Odobrena snaga)"],
    ["TR", "Bağlantı gücü"],
  ])("%s is a verified kW profile with free input", (code, term) => {
    const config = getConnectionConfig(code);
    expect(config.verified).toBe(true);
    expect(config.capacityInputType).toBe("contracted-kw");
    expect(config.connectionOptions).toHaveLength(0);
    expect(config.localTerm).toBe(term);
    expect(config.defaultFrequencyHz).toBe(50);
  });

  it.each([3, 5.5, 9, 11.7, 20, 35])("%s kW passes through unchanged on any phase model", (kw) => {
    for (const profile of [SINGLE_230, THREE_400]) {
      expect(
        connectionCapacityToMaxAcPowerKw({ type: "contracted-kw", kw, ...profile }),
      ).toBeCloseTo(kw, 9);
    }
  });
});

describe("IL — Israel (amperes per phase, verified options)", () => {
  const config = getConnectionConfig("IL");

  it("lists the verified 3-phase residential connection sizes", () => {
    expect(config.verified).toBe(true);
    expect(config.localTerm).toBe("גודל החיבור");
    expect(
      config.connectionOptions.map((o) => (o.capacity as { amperageA: number }).amperageA),
    ).toEqual([25, 40, 63, 80, 100]);
    for (const option of config.connectionOptions) {
      expect(option.capacity.serviceType).toBe("three-phase");
      expect(option.capacity.voltageV).toBe(400);
      expect(option.phasePrefix).toBe("3 × ");
    }
  });

  it.each([25, 40, 63, 80, 100])("3 x %s A = sqrt(3) x 400 x A", (a) => {
    expect(connectionCapacityToMaxAcPowerKw(amps(a, THREE_400))).toBeCloseTo(
      (Math.sqrt(3) * 400 * a) / 1000,
      6,
    );
  });
});

describe("regional markets stay unverified", () => {
  it.each(["AU", "BR", "ZA"])("%s keeps a non-verified profile requiring confirmation", (code) => {
    const config = getConnectionConfig(code);
    expect(config.verified).toBe(false);
    expect(config.status).not.toBe("verified");
    // Manual entry must still be possible: no forced preset.
    expect(config.defaultConnection).toBeNull();
  });

  it("BR and MX start at 60 Hz", () => {
    expect(getConnectionConfig("BR").defaultFrequencyHz).toBe(60);
    expect(getConnectionConfig("MX").defaultFrequencyHz).toBe(60);
  });
});

/* ---------------------- full chain through the engine --------------------- */

const MONTHLY_KWH_PER_KWP = [22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5];

function buildInput(countryCode: string, maxAcPowerKw: number): CalculationInput {
  return {
    location: {
      address: "Test 1",
      latitude: 40,
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

describe("batch 3: presets and free-input values survive the full engine chain", () => {
  const cases: Array<{ country: string; capacity: ConnectionCapacity }> = [
    ...[16, 25, 32, 63].map((a) => ({ country: "CH", capacity: amps(a, THREE_400) })),
    ...[15, 60, 100].map((a) => ({ country: "NZ", capacity: amps(a, SINGLE_230) })),
    ...[30, 50].map((a) => ({ country: "MX", capacity: amps(a, MX_SINGLE_127) })),
    { country: "MX", capacity: amps(100, MX_SPLIT_240) },
    { country: "MX", capacity: amps(40, MX_THREE_220) },
    ...getConnectionConfig("IL").connectionOptions.map((o) => ({
      country: "IL",
      capacity: o.capacity,
    })),
    ...[1.5, 6, 11.7, 35].flatMap((kw) =>
      ["BG", "RS", "TR"].map((country) => ({
        country,
        capacity: { type: "contracted-kw", kw, ...THREE_400 } as ConnectionCapacity,
      })),
    ),
  ];

  for (const { country, capacity } of cases) {
    const amount = connectionCapacityAmount(capacity);
    const maxAc = connectionCapacityToMaxAcPowerKw(capacity);
    it(`${country} ${amount}${connectionCapacityUnit(capacity.type)} -> finite sizing`, () => {
      expect(Number.isFinite(maxAc)).toBe(true);
      let result;
      try {
        result = calculateSolarSystem(buildInput(country, maxAc));
      } catch (error) {
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
});
