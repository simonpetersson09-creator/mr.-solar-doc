import { describe, expect, it } from "vitest";
import {
  SINGLE_PHASE_VOLTAGE_OPTIONS,
  SPLIT_PHASE_LINE_TO_LINE_V,
  THREE_PHASE_VOLTAGE_OPTIONS,
  maxAcPowerKwFor,
  voltageForServiceSwitch,
  voltageOptionsForService,
} from "./grid";
import { EU_THREE_PHASE_KW_PER_AMP } from "./constants";

describe("service-type constrained voltages", () => {
  it("never offers a line-to-line voltage as a single-phase service voltage", () => {
    expect(SINGLE_PHASE_VOLTAGE_OPTIONS).not.toContain(400);
    expect(SINGLE_PHASE_VOLTAGE_OPTIONS).not.toContain(415);
    expect(SINGLE_PHASE_VOLTAGE_OPTIONS).not.toContain(380);
  });

  it("keeps three-phase presets line-to-line only", () => {
    expect(THREE_PHASE_VOLTAGE_OPTIONS).toContain(400);
    expect(THREE_PHASE_VOLTAGE_OPTIONS).not.toContain(127);
    expect(THREE_PHASE_VOLTAGE_OPTIONS).not.toContain(240);
  });

  it("snaps an impossible 1-phase 400 V combination to 230 V", () => {
    expect(voltageForServiceSwitch("single-phase", 400)).toBe(230);
    expect(maxAcPowerKwFor({ mainFuseAmp: 35, voltageV: 230, serviceType: "single-phase" })).toBeCloseTo(8.05, 2);
  });

  it("keeps a compatible voltage when switching service type", () => {
    expect(voltageForServiceSwitch("single-phase", 230)).toBe(230);
    expect(voltageForServiceSwitch("three-phase", 415)).toBe(415);
    expect(voltageForServiceSwitch("split-phase", 400)).toBe(SPLIT_PHASE_LINE_TO_LINE_V);
  });

  it("only exposes presets valid for the selected service", () => {
    for (const service of ["single-phase", "three-phase", "split-phase"] as const) {
      for (const voltage of voltageOptionsForService(service)) {
        expect(voltageForServiceSwitch(service, voltage)).toBe(voltage);
      }
    }
  });

  it("derives the European kW/A factor from the physics rule", () => {
    expect(EU_THREE_PHASE_KW_PER_AMP).toBeCloseTo(0.6928, 4);
  });
});
