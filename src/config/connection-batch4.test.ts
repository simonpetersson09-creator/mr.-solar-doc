/**
 * Golden tests for batch 4 connection profiles: IS, LU, MT, CY, MK, AL, BA, ME
 * — plus the deliberate NON-promotion of AU and ZA.
 *
 * The eight European profiles are verified free-input amperage profiles: the
 * input model (unit, voltage system, frequency) is confirmed against national
 * sources, but no invented customer ladder is shipped and no phase model is
 * assumed — both 1-phase 230 V and 3-phase 400 V are normal, so the step asks
 * (`phaseChoice`).
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
import { voltageForPhaseChoice } from "./grid";
import { calculateSolarSystem, GridTooSmallError } from "@/lib/calc/engine";
import { MARKETS } from "./markets";
import type { CalculationInput } from "@/lib/calc/types";

const SINGLE_230 = { serviceType: "single-phase", voltageV: 230, frequencyHz: 50 } as const;
const THREE_400 = { serviceType: "three-phase", voltageV: 400, frequencyHz: 50 } as const;

const amps = (amperageA: number, profile: object): ConnectionCapacity =>
  ({ type: "amperage", amperageA, ...profile }) as ConnectionCapacity;

const BATCH_4 = ["IS", "LU", "MT", "CY", "MK", "AL", "BA", "ME"] as const;
/** Which service type the country starts on — the user may change it. */
const DEFAULT_SERVICE: Record<string, "single-phase" | "three-phase"> = {
  IS: "three-phase",
  LU: "three-phase",
  MK: "three-phase",
  AL: "three-phase",
  BA: "three-phase",
  ME: "three-phase",
  MT: "single-phase",
  CY: "single-phase",
};

describe("batch 4 verified amperage profiles", () => {
  it.each(BATCH_4)("%s is a verified free-input amperage profile", (code) => {
    const config = getConnectionConfig(code);
    expect(config.verified).toBe(true);
    expect(config.status).toBe("verified");
    expect(config.capacityInputType).toBe("amperage");
    // No invented national ladder.
    expect(config.connectionOptions).toHaveLength(0);
    expect(config.defaultConnection).toBeNull();
    expect(config.defaultFrequencyHz).toBe(50);
  });

  it.each(BATCH_4)("%s offers an explicit phase choice", (code) => {
    expect(getConnectionConfig(code).phaseChoice).toBe(true);
  });

  it.each(BATCH_4)("%s starts on its documented service type and voltage", (code) => {
    const config = getConnectionConfig(code);
    const expected = DEFAULT_SERVICE[code]!;
    expect(config.defaultServiceType).toBe(expected);
    expect(config.defaultVoltage).toBe(expected === "three-phase" ? 400 : 230);
  });

  it("snaps the voltage to the nominal value of the chosen phase model", () => {
    expect(voltageForPhaseChoice("single-phase")).toBe(230);
    expect(voltageForPhaseChoice("three-phase")).toBe(400);
  });

  it("the same ampere value means different power per phase model", () => {
    // The whole reason the phase question is asked before the ampere value.
    expect(connectionCapacityToMaxAcPowerKw(amps(35, SINGLE_230))).toBeCloseTo(8.05, 2);
    expect(connectionCapacityToMaxAcPowerKw(amps(35, THREE_400))).toBeCloseTo(24.25, 2);
  });

  it.each([25, 32, 40, 63])("3-phase 400 V: %s A = sqrt(3) x 400 x A", (a) => {
    expect(connectionCapacityToMaxAcPowerKw(amps(a, THREE_400))).toBeCloseTo(
      (Math.sqrt(3) * 400 * a) / 1000,
      6,
    );
  });

  it.each([40, 60, 63, 80])("single-phase 230 V: %s A = 230 x A", (a) => {
    expect(connectionCapacityToMaxAcPowerKw(amps(a, SINGLE_230))).toBeCloseTo(
      (230 * a) / 1000,
      6,
    );
  });
});

describe("AU and ZA stay on the manual fallback", () => {
  // Australia varies by DNSP/state and South African residential supply is
  // stated in amperes (Homelight) or kVA (Homepower). Neither fits one national
  // profile, so both must keep the confirmation gate and free manual entry.
  it.each(["AU", "ZA"])("%s is not a verified profile", (code) => {
    const config = getConnectionConfig(code);
    expect(config.verified).toBe(false);
    expect(config.status).not.toBe("verified");
    expect(config.defaultConnection).toBeNull();
    expect(config.connectionOptions).toHaveLength(0);
  });

  it.each(["AU", "ZA"])("%s asks for the phase model explicitly", (code) => {
    expect(getConnectionConfig(code).phaseChoice).toBe(true);
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
    // Both phase models must work in every one of these markets.
    ...[25, 40].map((a) => ({ country: "MT", capacity: amps(a, THREE_400) })),
    ...[40, 63].map((a) => ({ country: "IS", capacity: amps(a, SINGLE_230) })),
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
