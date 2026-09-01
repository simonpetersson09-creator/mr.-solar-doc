/**
 * Golden tests for the HU / RO / GR connection profiles.
 *
 * These cover the CONNECTION model only: unit, phases, voltage and the
 * normalisation to AC power. PV/export rules, tariffs and incentives are a
 * separate domain and are not asserted here.
 */
import { describe, expect, it } from "vitest";
import { getConnectionConfig } from "./connections";
import {
  connectionCapacityToMaxAcPowerKw,
  type ConnectionCapacity,
} from "./connection-capacity";

const SINGLE = { serviceType: "single-phase", voltageV: 230, frequencyHz: 50 } as const;
const THREE = { serviceType: "three-phase", voltageV: 400, frequencyHz: 50 } as const;

const amps = (amperageA: number, profile: typeof SINGLE | typeof THREE): ConnectionCapacity => ({
  type: "amperage",
  amperageA,
  ...profile,
});

describe("HU — Hungary (amperes per phase, free input)", () => {
  const config = getConnectionConfig("HU");

  it("is a verified amperage profile with no invented ladder", () => {
    expect(config.verified).toBe(true);
    expect(config.capacityInputType).toBe("amperage");
    expect(config.connectionOptions).toHaveLength(0);
    expect(config.localTerm).toContain("A/fázis");
    expect(config.defaultFrequencyHz).toBe(50);
  });

  it.each([16, 32, 27])("single-phase %s A = 230 x A", (a) => {
    expect(connectionCapacityToMaxAcPowerKw(amps(a, SINGLE))).toBeCloseTo((230 * a) / 1000, 6);
  });

  it.each([16, 32, 27])("three-phase %s A = sqrt(3) x 400 x A", (a) => {
    expect(connectionCapacityToMaxAcPowerKw(amps(a, THREE))).toBeCloseTo(
      (Math.sqrt(3) * 400 * a) / 1000,
      6,
    );
  });
});

describe("RO — Romania (putere aprobată in kW, free input)", () => {
  const config = getConnectionConfig("RO");

  it("is a verified kW profile with the local term and no ladder", () => {
    expect(config.verified).toBe(true);
    expect(config.capacityInputType).toBe("contracted-kw");
    expect(config.connectionOptions).toHaveLength(0);
    expect(config.localTerm).toBe("Putere aprobată");
  });

  it.each([3, 7.5, 9, 11.7, 20])("%s kW passes through unchanged", (kw) => {
    for (const profile of [SINGLE, THREE]) {
      expect(
        connectionCapacityToMaxAcPowerKw({ type: "contracted-kw", kw, ...profile }),
      ).toBeCloseTo(kw, 9);
    }
  });
});

describe("GR — Greece (ισχύς παροχής in kVA)", () => {
  const config = getConnectionConfig("GR");

  it("lists the verified DEDDIE LV series as phase-independent totals", () => {
    expect(config.verified).toBe(true);
    expect(config.capacityInputType).toBe("contracted-kva");
    expect(config.localTerm).toBe("Ισχύς παροχής");
    expect(config.connectionOptions.map((o) => (o.capacity as { kva: number }).kva)).toEqual([
      8, 12, 15, 25, 35, 55,
    ]);
    for (const option of config.connectionOptions) {
      expect(option.phasePrefix).toBeUndefined();
      expect(option.capacity.serviceType).toBeUndefined();
    }
  });

  it.each([8, 12, 15, 25, 35, 55])(
    "%s kVA converts with the documented PF, never with sqrt(3)",
    (kva) => {
      const single = connectionCapacityToMaxAcPowerKw({
        type: "contracted-kva",
        kva,
        ...SINGLE,
      });
      const three = connectionCapacityToMaxAcPowerKw({ type: "contracted-kva", kva, ...THREE });
      expect(single).toBe(three);
      expect(single).toBeLessThanOrEqual(kva);
      expect(single).toBeGreaterThan(kva * 0.8);
    },
  );
});
