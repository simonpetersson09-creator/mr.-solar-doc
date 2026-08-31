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
    expect(config.defaultVoltage).toBe(400);
    expect(config.defaultFrequencyHz).toBe(50);
    expect(config.defaultServiceType).toBe("three-phase");
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
      (o) => o.capacity.voltageV === 230 && o.capacity.serviceType === "three-phase",
    )!;
    // sqrt(3) x 230 x 40 / 1000
    expect(Math.abs(acPowerOf(option.capacity) - 15.93)).toBeLessThan(0.6);
  });

  it("finds an option by id", () => {
    const config = getConnectionConfig("SE");
    const first = config.connectionOptions[0]!;
    expect(findConnectionOption(config, first.id)?.capacity).toEqual(first.capacity);
    expect(findConnectionOption(config, null)).toBeNull();
    expect(findConnectionOption(config, "nope")).toBeNull();
  });
});
