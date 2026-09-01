/**
 * Golden tests for batch 4 connection profiles: IS, LU, MT, CY, MK, AL, BA, ME,
 * AU, ZA.
 *
 * All ten are verified free-input amperage profiles: the input model (unit,
 * phase, voltage, frequency) is confirmed against national sources, but no
 * invented customer ladder is shipped — the user enters the actual rating.
 *
 * Connection domain only — PV rules, export limits and tariffs are separate.
 */
import { describe, expect, it } from "vitest";
import { getConnectionConfig } from "./connections";
import {
  connectionCapacityAmount,
  connectionCapacityToMaxAcPowerKw,
  connectionCapacityUnit,
  type ConnectionCapacity,
} from "./connection-capacity";
import { calculateSolarSystem, GridTooSmallError } from "@/lib/calc/engine";
import { MARKETS } from "./markets";
import type { CalculationInput } from "@/lib/calc/types";

const SINGLE_230 = { serviceType: "single-phase", voltageV: 230, frequencyHz: 50 } as const;
const THREE_400 = { serviceType: "three-phase", voltageV: 400, frequencyHz: 50 } as const;

const amps = (amperageA: number, profile: object): ConnectionCapacity =>
  ({ type: "amperage", amperageA, ...profile }) as ConnectionCapacity;

describe("batch 4 verified amperage profiles", () => {
  // 3-phase 400 V / 50 Hz markets — connection rated in A per phase.
  const threePhaseMarkets: Array<[string, string]> = [
    ["IS", "Tengi (A/fasa)"],
    ["LU", "Disjoncteur de branchement"],
    ["MK", "Приклучна снага (A/faza)"],
    ["AL", "Fuqia e lidhjes (A/fazë)"],
    ["BA", "Priključna snaga (A/faza)"],
    ["ME", "Priključna snaga (A/faza)"],
  ];

  // Single-phase 230 V / 50 Hz markets — connection rated in A/phase.
  const singlePhaseMarkets: Array<[string, string]> = [
    ["MT", "Service capacity (A/phase)"],
    ["CY", "Connection capacity (A/phase)"],
    ["AU", "Main switch / service capacity (A/phase)"],
    ["ZA", "Supply capacity / main fuse (A/phase)"],
  ];

  it.each(threePhaseMarkets)(
    "%s is a verified 3-phase 400 V free-input amperage profile",
    (code, term) => {
      const config = getConnectionConfig(code);
      expect(config.verified).toBe(true);
      expect(config.status).toBe("verified");
      expect(config.capacityInputType).toBe("amperage");
      expect(config.connectionOptions).toHaveLength(0);
      expect(config.defaultServiceType).toBe("three-phase");
      expect(config.defaultVoltage).toBe(400);
      expect(config.defaultFrequencyHz).toBe(50);
      expect(config.localTerm).toBe(term);
    },
  );

  it.each(singlePhaseMarkets)(
    "%s is a verified single-phase 230 V free-input amperage profile",
    (code, term) => {
      const config = getConnectionConfig(code);
      expect(config.verified).toBe(true);
      expect(config.status).toBe("verified");
      expect(config.capacityInputType).toBe("amperage");
      expect(config.connectionOptions).toHaveLength(0);
      expect(config.defaultServiceType).toBe("single-phase");
      expect(config.defaultVoltage).toBe(230);
      expect(config.defaultFrequencyHz).toBe(50);
      expect(config.localTerm).toBe(term);
    },
  );

  it.each([25, 32, 40, 63])(
    "3-phase 400 V markets: %s A = sqrt(3) x 400 x A",
    (a) => {
      expect(connectionCapacityToMaxAcPowerKw(amps(a, THREE_400))).toBeCloseTo(
        (Math.sqrt(3) * 400 * a) / 1000,
        6,
      );
    },
  );

  it.each([40, 60, 63, 80])(
    "single-phase 230 V markets: %s A = 230 x A",
    (a) => {
      expect(connectionCapacityToMaxAcPowerKw(amps(a, SINGLE_230))).toBeCloseTo(
        (230 * a) / 1000,
        6,
      );
    },
  );
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

describe("batch 4: free-input values survive the full engine chain", () => {
  const cases: Array<{ country: string; capacity: ConnectionCapacity }> = [
    ...[25, 32, 40, 63].map((a) => ({ country: "IS", capacity: amps(a, THREE_400) })),
    ...[25, 35, 63].map((a) => ({ country: "LU", capacity: amps(a, THREE_400) })),
    ...[25, 40, 63].map((a) => ({ country: "MK", capacity: amps(a, THREE_400) })),
    ...[25, 40].map((a) => ({ country: "AL", capacity: amps(a, THREE_400) })),
    ...[25, 40].map((a) => ({ country: "BA", capacity: amps(a, THREE_400) })),
    ...[25, 40].map((a) => ({ country: "ME", capacity: amps(a, THREE_400) })),
    ...[40, 60].map((a) => ({ country: "MT", capacity: amps(a, SINGLE_230) })),
    ...[40, 60].map((a) => ({ country: "CY", capacity: amps(a, SINGLE_230) })),
    ...[40, 63, 80].map((a) => ({ country: "AU", capacity: amps(a, SINGLE_230) })),
    ...[60, 80].map((a) => ({ country: "ZA", capacity: amps(a, SINGLE_230) })),
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
