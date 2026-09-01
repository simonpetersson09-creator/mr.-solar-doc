/**
 * Regression tests for the GLOBAL manual fallback: unit choice (A/kW/kVA),
 * the two-phase (phase-to-phase) service model, and the rule that a
 * confirmation is invalidated by any change to the calculation premise.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  SERVICE_TYPE_AC_FACTOR,
  SERVICE_TYPE_FOR_PHASE_COUNT,
  PHASE_COUNT_FOR_SERVICE_TYPE,
  SERVICE_TYPE_OPTIONS,
  TWO_PHASE_LINE_TO_LINE_V,
  maxAcPowerKwFor,
  voltageOptionsForService,
} from "./grid";
import {
  FALLBACK_INPUT_TYPES,
  connectionCapacityToMaxAcPowerKw,
} from "./connection-capacity";
import { getConnectionConfig } from "./connections";
import { useWizardStore } from "@/state/wizard-store";

const amps = (amperageA: number, serviceType: Parameters<typeof voltageOptionsForService>[0], voltageV: number) =>
  connectionCapacityToMaxAcPowerKw({
    type: "amperage",
    amperageA,
    serviceType,
    voltageV,
    frequencyHz: 50,
  });

describe("fallback input units", () => {
  it("offers ampere, kW and kVA", () => {
    expect([...FALLBACK_INPUT_TYPES]).toEqual(["amperage", "contracted-kw", "contracted-kva"]);
  });

  it("kW is 1:1", () => {
    expect(
      connectionCapacityToMaxAcPowerKw({ type: "contracted-kw", kw: 13.8 }),
    ).toBeCloseTo(13.8, 10);
  });

  it("kVA uses the power factor", () => {
    expect(connectionCapacityToMaxAcPowerKw({ type: "contracted-kva", kva: 10 })).toBeCloseTo(10, 10);
    expect(
      connectionCapacityToMaxAcPowerKw(
        { type: "contracted-kva", kva: 10 },
        { contractedKvaPowerFactor: 0.9 },
      ),
    ).toBeCloseTo(9, 10);
  });

  it("amperes go through the central grid physics", () => {
    expect(amps(25, "single-phase", 230)).toBeCloseTo(5.75, 10);
    expect(amps(35, "three-phase", 400)).toBeCloseTo(Math.sqrt(3) * 400 * 35 / 1000, 10);
    expect(amps(200, "split-phase", 240)).toBeCloseTo(48, 10);
    expect(amps(35, "two-phase", 220)).toBeCloseTo(7.7, 10);
  });
});

describe("two-phase / phase-to-phase model", () => {
  it("is its own service type, separate from three-phase and split-phase", () => {
    expect(SERVICE_TYPE_OPTIONS).toContain("two-phase");
    expect(SERVICE_TYPE_AC_FACTOR["two-phase"]).toBe(1);
    expect(SERVICE_TYPE_AC_FACTOR["three-phase"]).toBeCloseTo(Math.sqrt(3), 12);
    expect(PHASE_COUNT_FOR_SERVICE_TYPE["two-phase"]).toBe(2);
    expect(SERVICE_TYPE_FOR_PHASE_COUNT[2]).toBe("two-phase");
  });

  it("uses P = U_LL x I with no sqrt(3) — Brazilian 220 V x 35 A = 7.70 kW", () => {
    expect(
      maxAcPowerKwFor({ mainFuseAmp: 35, voltageV: TWO_PHASE_LINE_TO_LINE_V, serviceType: "two-phase" }),
    ).toBeCloseTo(7.7, 10);
  });

  it("offers only line-to-line voltage presets", () => {
    expect(voltageOptionsForService("two-phase")).toContain(220);
    expect(voltageOptionsForService("two-phase")).not.toContain(127);
  });
});

describe("unsupported markets keep the manual fallback", () => {
  it.each(["AU", "ZA", "BR", "XX"])("%s is unsupported and has no preset options", (code) => {
    const config = getConnectionConfig(code);
    expect(config.status).toBe("unsupported");
    expect(config.verified).toBe(false);
    expect(config.connectionOptions).toHaveLength(0);
  });
});

describe("verified profiles are unchanged", () => {
  it("keeps Swedish ampere presets and 3 x 400 V", () => {
    const se = getConnectionConfig("SE");
    expect(se.status).toBe("verified");
    expect(se.capacityInputType).toBe("amperage");
    expect(se.defaultServiceType).toBe("three-phase");
    expect(se.defaultVoltage).toBe(400);
    expect(se.connectionOptions.length).toBeGreaterThan(0);
  });

  it("keeps US split-phase 120/240 V", () => {
    const us = getConnectionConfig("US");
    expect(us.defaultServiceType).toBe("split-phase");
    expect(us.defaultVoltage).toBe(240);
  });

  it("keeps kVA/kW markets on their own unit", () => {
    expect(getConnectionConfig("FR").capacityInputType).toBe("contracted-kva");
    expect(getConnectionConfig("PL").capacityInputType).toBe("contracted-kw");
  });
});

describe("confirmation is invalidated by any premise change", () => {
  const store = () => useWizardStore.getState();

  beforeEach(() => {
    store().reset();
    useWizardStore.setState({
      gridServiceType: "single-phase",
      gridVoltageV: 230,
      gridFrequencyHz: 50,
    });
  });

  const confirm = () => {
    store().setGridConfirmed(true);
    expect(store().gridConfirmed).toBe(true);
  };

  it("resets on a phase-model change", () => {
    confirm();
    store().setGridProfile({ serviceType: "three-phase", voltageV: 400 });
    expect(store().gridConfirmed).toBe(false);
  });

  it("resets on a voltage change", () => {
    confirm();
    store().setGridProfile({ voltageV: 240 });
    expect(store().gridConfirmed).toBe(false);
  });

  it("resets on a frequency change", () => {
    confirm();
    store().setGridProfile({ frequencyHz: 60 });
    expect(store().gridConfirmed).toBe(false);
  });

  it("keeps the confirmation when nothing actually changed", () => {
    confirm();
    store().setGridProfile({ voltageV: 230 });
    expect(store().gridConfirmed).toBe(true);
  });

  it("resets on an amount change", () => {
    store().setConnectionCapacity({
      type: "amperage",
      amperageA: 25,
      serviceType: "single-phase",
      voltageV: 230,
      frequencyHz: 50,
    });
    confirm();
    store().setConnectionCapacity({
      type: "amperage",
      amperageA: 35,
      serviceType: "single-phase",
      voltageV: 230,
      frequencyHz: 50,
    });
    expect(store().gridConfirmed).toBe(false);
  });

  it("resets when the input unit changes", () => {
    store().setConnectionCapacity({
      type: "amperage",
      amperageA: 25,
      serviceType: "single-phase",
      voltageV: 230,
      frequencyHz: 50,
    });
    confirm();
    store().setConnectionCapacity({ type: "contracted-kva", kva: 5.75 });
    expect(store().gridConfirmed).toBe(false);
  });

  it("resets on a main fuse change", () => {
    store().setMainFuse(25);
    confirm();
    store().setMainFuse(35);
    expect(store().gridConfirmed).toBe(false);
  });

  it("keeps the confirmation when the same capacity is re-submitted", () => {
    const capacity = {
      type: "amperage" as const,
      amperageA: 25,
      serviceType: "single-phase" as const,
      voltageV: 230,
      lineToNeutralVoltageV: null,
      frequencyHz: 50,
    };
    store().setConnectionCapacity(capacity);
    confirm();
    store().setConnectionCapacity({ ...capacity });
    expect(store().gridConfirmed).toBe(true);
  });
});
