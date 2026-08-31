import { describe, expect, it } from "vitest";
import {
  findConnectionOption,
  getConnectionConfig,
  hasVerifiedConnectionConfig,
  type ConnectionOption,
} from "./connections";
import { kwPerAmpFor } from "./grid";
import { maxAcPowerFromFuse } from "@/lib/calc/inverter-sizing";

const acPowerOf = (option: ConnectionOption, phaseCount = option.phaseCount, voltage = option.voltage) =>
  maxAcPowerFromFuse(option.amperage, kwPerAmpFor(phaseCount, voltage));

describe("country connection config", () => {
  it("a Swedish address gets the Swedish connection options", () => {
    const config = getConnectionConfig("SE");
    expect(config.verified).toBe(true);
    expect(config.connectionOptions.map((o) => o.label)).toEqual([
      "16 A",
      "20 A",
      "25 A",
      "35 A",
      "50 A",
      "63 A",
    ]);
  });

  it("is driven by the country code, not the app language", () => {
    expect(getConnectionConfig("se")).toEqual(getConnectionConfig("SE"));
  });

  it("Swedish 16 A uses three-phase / 400 V / 50 Hz", () => {
    const option = getConnectionConfig("SE").connectionOptions[0]!;
    expect(option).toMatchObject({
      amperage: 16,
      serviceType: "three-phase",
      phaseCount: 3,
      voltage: 400,
      frequencyHz: 50,
    });
    expect(Math.abs(acPowerOf(option) - 11.09)).toBeLessThan(0.02);
  });

  it("Swedish 25 A uses the same grid profile", () => {
    const option = getConnectionConfig("SE").connectionOptions.find((o) => o.amperage === 25)!;
    expect(option).toMatchObject({ phaseCount: 3, voltage: 400, frequencyHz: 50 });
    expect(Math.abs(acPowerOf(option) - 17.32)).toBeLessThan(0.02);
  });

  it("manually changed grid settings override the country default", () => {
    const option = getConnectionConfig("SE").connectionOptions[0]!;
    // User switches to single-phase 230 V in the grid settings.
    expect(Math.abs(acPowerOf(option, 1, 230) - 3.68)).toBeLessThan(0.02);
  });

  it("a country without its own config falls back without Swedish fuse options", () => {
    const config = getConnectionConfig("US");
    expect(config.verified).toBe(false);
    expect(config.connectionOptions).toEqual([]);
    expect(config.defaultVoltage).toBe(400);
    expect(config.defaultFrequencyHz).toBe(50);
    expect(config.defaultServiceType).toBe("three-phase");
    expect(hasVerifiedConnectionConfig("US")).toBe(false);
    expect(hasVerifiedConnectionConfig("SE")).toBe(true);
  });

  it("supports free-form labels such as 3 x 25 A without affecting the calculation", () => {
    const option: ConnectionOption = {
      id: "3x25",
      label: "3 × 25 A",
      amperage: 25,
      serviceType: "three-phase",
      phaseCount: 3,
      voltage: 400,
      frequencyHz: 50,
    };
    expect(Math.abs(acPowerOf(option) - 17.32)).toBeLessThan(0.02);

    const singlePhase: ConnectionOption = { ...option, id: "1x35", label: "1 × 35 A", amperage: 35, serviceType: "single-phase", phaseCount: 1, voltage: 230 };
    expect(Math.abs(acPowerOf(singlePhase) - 8.05)).toBeLessThan(0.02);
  });

  it("finds an option by id", () => {
    const config = getConnectionConfig("SE");
    expect(findConnectionOption(config, "3x20")?.amperage).toBe(20);
    expect(findConnectionOption(config, null)).toBeNull();
    expect(findConnectionOption(config, "nope")).toBeNull();
  });
});
