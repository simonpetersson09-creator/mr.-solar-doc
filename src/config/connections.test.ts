import { describe, expect, it } from "vitest";
import {
  findConnectionOption,
  getConnectionConfig,
  hasVerifiedConnectionConfig,
} from "./connections";
import {
  connectionCapacityAmount,
  connectionCapacityToMaxAcPowerKw,
  type ConnectionCapacity,
} from "./connection-capacity";

/** All power comes from the one normalisation point, whatever the unit is. */
const acPowerOf = (capacity: ConnectionCapacity) => connectionCapacityToMaxAcPowerKw(capacity);

const amountsOf = (countryCode: string) =>
  getConnectionConfig(countryCode).connectionOptions.map((o) =>
    connectionCapacityAmount(o.capacity),
  );

describe("country connection config", () => {
  it("a Swedish address gets the Swedish ampere options", () => {
    const config = getConnectionConfig("SE");
    expect(config.verified).toBe(true);
    expect(config.capacityInputType).toBe("amperage");
    expect(amountsOf("SE")).toEqual([16, 20, 25, 35, 50, 63]);
  });

  it("is driven by the country code, not the app language", () => {
    expect(getConnectionConfig("se")).toEqual(getConnectionConfig("SE"));
  });

  it("Swedish 16 A uses three-phase / 400 V / 50 Hz", () => {
    const option = getConnectionConfig("SE").connectionOptions[0]!;
    expect(option.capacity).toMatchObject({
      type: "amperage",
      amperageA: 16,
      serviceType: "three-phase",
      voltageV: 400,
      frequencyHz: 50,
    });
    expect(Math.abs(acPowerOf(option.capacity) - 11.09)).toBeLessThan(0.02);
  });

  it("Swedish 25 A uses the same grid profile", () => {
    const option = getConnectionConfig("SE").connectionOptions.find(
      (o) => connectionCapacityAmount(o.capacity) === 25,
    )!;
    expect(option.capacity).toMatchObject({ voltageV: 400, frequencyHz: 50 });
    expect(Math.abs(acPowerOf(option.capacity) - 17.32)).toBeLessThan(0.02);
  });

  it("manually changed grid settings override the country default", () => {
    const option = getConnectionConfig("SE").connectionOptions[0]!;
    // The user switches to single-phase 230 V in the grid settings.
    const overridden: ConnectionCapacity = {
      type: "amperage",
      amperageA: 16,
      serviceType: "single-phase",
      voltageV: 230,
      frequencyHz: 50,
    };
    expect(Math.abs(acPowerOf(overridden) - 3.68)).toBeLessThan(0.02);
  });

  it("a country without its own config falls back without Swedish fuse options", () => {
    const config = getConnectionConfig("ZZ");
    expect(config.verified).toBe(false);
    expect(config.connectionOptions).toEqual([]);
    // Never the Swedish 3-phase 400 V profile: an unverified country gets a
    // neutral starting point the user can change.
    expect(config.defaultVoltage).toBe(230);
    expect(config.defaultFrequencyHz).toBe(50);
    expect(config.defaultServiceType).toBe("single-phase");
    expect(config.defaultConnection).toBeNull();
    expect(hasVerifiedConnectionConfig("ZZ")).toBe(false);
    expect(hasVerifiedConnectionConfig("SE")).toBe(true);
  });

  it("a display prefix such as 3 × 25 A does not affect the calculation", () => {
    const option = getConnectionConfig("FI").connectionOptions[0]!;
    expect(option.phasePrefix).toBe("3 × ");
    expect(Math.abs(acPowerOf(option.capacity) - 17.32)).toBeLessThan(0.02);
  });

  /* ------------------------- non-ampere markets ------------------------- */

  it("France states the connection in kVA and converts with power factor 1.0", () => {
    const config = getConnectionConfig("FR");
    expect(config.capacityInputType).toBe("contracted-kva");
    expect(config.localTerm).toBe("Puissance souscrite");
    const nineKva = config.connectionOptions.find(
      (o) => connectionCapacityAmount(o.capacity) === 9,
    )!;
    expect(acPowerOf(nineKva.capacity)).toBeCloseTo(9, 5);
  });

  it("Spain states the connection in kW and uses it directly", () => {
    const config = getConnectionConfig("ES");
    expect(config.capacityInputType).toBe("contracted-kw");
    const option = config.connectionOptions.find(
      (o) => connectionCapacityAmount(o.capacity) === 4.6,
    )!;
    expect(acPowerOf(option.capacity)).toBeCloseTo(4.6, 5);
  });

  it("Belgium supports 3 × 230 V without neutral", () => {
    const option = getConnectionConfig("BE").connectionOptions.find(
      (o) =>
        o.capacity.voltageV === 230 &&
        o.capacity.serviceType === "three-phase" &&
        connectionCapacityAmount(o.capacity) === 40,
    )!;
    // sqrt(3) x 230 x 40 / 1000
    expect(Math.abs(acPowerOf(option.capacity) - 15.93)).toBeLessThan(0.05);
  });

  it("finds an option by id", () => {
    const config = getConnectionConfig("SE");
    const first = config.connectionOptions[0]!;
    expect(findConnectionOption(config, first.id)?.capacity).toEqual(first.capacity);
    expect(findConnectionOption(config, null)).toBeNull();
    expect(findConnectionOption(config, "nope")).toBeNull();
  });
});

/* ------------------- verified country profiles (audit) ------------------- */

describe("verified country profiles match the connection audit", () => {
  const expectations: Array<{
    country: string;
    inputType: string;
    amounts: number[];
    serviceType: string;
    voltageV: number;
    frequencyHz: number;
  }> = [
    { country: "SE", inputType: "amperage", amounts: [16, 20, 25, 35, 50, 63], serviceType: "three-phase", voltageV: 400, frequencyHz: 50 },
    { country: "DK", inputType: "amperage", amounts: [16, 20, 25, 32, 35, 50, 63], serviceType: "three-phase", voltageV: 400, frequencyHz: 50 },
    { country: "DE", inputType: "amperage", amounts: [35, 50, 63], serviceType: "three-phase", voltageV: 400, frequencyHz: 50 },
    { country: "FI", inputType: "amperage", amounts: [25, 35, 50, 63, 25, 35], serviceType: "three-phase", voltageV: 400, frequencyHz: 50 },
    { country: "NL", inputType: "amperage", amounts: [25, 35, 25, 35, 50, 63, 80], serviceType: "single-phase", voltageV: 230, frequencyHz: 50 },
    { country: "GB", inputType: "amperage", amounts: [60, 80, 100], serviceType: "single-phase", voltageV: 230, frequencyHz: 50 },
    { country: "PT", inputType: "contracted-kva", amounts: [1.15, 2.3, 3.45, 4.6, 5.75, 6.9, 10.35], serviceType: "single-phase", voltageV: 230, frequencyHz: 50 },
    { country: "IT", inputType: "contracted-kw", amounts: [3, 4.5, 6, 10, 15], serviceType: "single-phase", voltageV: 230, frequencyHz: 50 },
    { country: "ES", inputType: "contracted-kw", amounts: [3.45, 4.6, 5.75, 6.9], serviceType: "single-phase", voltageV: 230, frequencyHz: 50 },
    { country: "US", inputType: "amperage", amounts: [60, 100, 125, 150, 200, 400], serviceType: "split-phase", voltageV: 240, frequencyHz: 60 },
    { country: "CA", inputType: "amperage", amounts: [100, 200, 400], serviceType: "split-phase", voltageV: 240, frequencyHz: 60 },
    { country: "JP", inputType: "amperage", amounts: [10, 15, 20, 30, 40, 50, 60], serviceType: "split-phase", voltageV: 200, frequencyHz: 50 },
  ];

  it.each(expectations)(
    "$country: input type, levels, grid profile and no forced default",
    ({ country, inputType, amounts, serviceType, voltageV, frequencyHz }) => {
      const config = getConnectionConfig(country);
      expect(config.verified).toBe(true);
      expect(config.capacityInputType).toBe(inputType);
      expect(amountsOf(country)).toEqual(amounts);
      expect(config.defaultServiceType).toBe(serviceType);
      expect(config.defaultVoltage).toBe(voltageV);
      expect(config.defaultFrequencyHz).toBe(frequencyHz);
      // No connection level may be preselected for the user.
      expect(config.defaultConnection).toBeNull();
    },
  );

  it("every option id is unique per country", () => {
    for (const { country } of expectations.concat([{ country: "FR" } as never])) {
      const ids = getConnectionConfig(country).connectionOptions.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("France offers both single-phase and three-phase kVA steps", () => {
    const config = getConnectionConfig("FR");
    const single = config.connectionOptions.filter(
      (o) => o.capacity.serviceType === "single-phase",
    );
    const three = config.connectionOptions.filter(
      (o) => o.capacity.serviceType === "three-phase",
    );
    expect(single.map((o) => connectionCapacityAmount(o.capacity))).toEqual([3, 6, 9, 12]);
    expect(three.map((o) => connectionCapacityAmount(o.capacity))).toEqual([
      9, 12, 15, 18, 24, 30, 36,
    ]);
    expect(config.defaultServiceType).toBe("single-phase");
  });

  it("US and CA split-phase use 240 V line-to-line and no sqrt(3)", () => {
    for (const country of ["US", "CA"]) {
      const option = getConnectionConfig(country).connectionOptions.find(
        (o) => connectionCapacityAmount(o.capacity) === 100,
      )!;
      expect(option.capacity).toMatchObject({
        serviceType: "split-phase",
        voltageV: 240,
        lineToNeutralVoltageV: 120,
        frequencyHz: 60,
      });
      expect(acPowerOf(option.capacity)).toBeCloseTo(24, 5);
    }
  });

  it("Japan contract amperage is normalised at the 200 V level", () => {
    const option = getConnectionConfig("JP").connectionOptions.find(
      (o) => connectionCapacityAmount(o.capacity) === 30,
    )!;
    expect(acPowerOf(option.capacity)).toBeCloseTo(6, 5);
    expect(option.capacity.lineToNeutralVoltageV).toBe(100);
  });

  it("Belgium keeps 1-phase, 3 × 230 V and 3N400 V as separate profiles", () => {
    const config = getConnectionConfig("BE");
    const profiles = new Set(
      config.connectionOptions.map((o) => `${o.capacity.serviceType}@${o.capacity.voltageV}`),
    );
    expect(profiles).toEqual(
      new Set(["single-phase@230", "three-phase@230", "three-phase@400"]),
    );
    const be230 = config.connectionOptions.find(
      (o) =>
        o.capacity.serviceType === "three-phase" &&
        o.capacity.voltageV === 230 &&
        connectionCapacityAmount(o.capacity) === 25,
    )!;
    // 3 × 230 V 25 A ≈ 9.96 kW — not the 400 V value.
    expect(acPowerOf(be230.capacity)).toBeCloseTo(9.96, 1);
  });

  it("generic code still handles three-phase 230 V without neutral (Norway-style)", () => {
    expect(
      acPowerOf({
        type: "amperage",
        amperageA: 25,
        serviceType: "three-phase",
        voltageV: 230,
        frequencyHz: 50,
      }),
    ).toBeCloseTo(9.96, 1);
  });

  it("local technical terms are metadata only, never UI language", () => {
    expect(getConnectionConfig("DE").localTerm).toBe("Hausanschlusssicherung");
    expect(getConnectionConfig("FR").localTerm).toBe("Puissance souscrite");
    expect(getConnectionConfig("US").localTerm).toBe("Electrical service size");
    // The question/help text always comes from i18n keys, not the local term.
    expect(getConnectionConfig("DE").questionKey).toMatch(/^fuse\.capacity\./);
    expect(getConnectionConfig("FR").helpTextKey).toMatch(/^fuse\.capacity\./);
  });
});
