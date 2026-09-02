import { describe, expect, it } from "vitest";
import {
  buildInverterOptions,
  inverterCatalogFor,
  isInverterCompatible,
} from "@/config/inverter-catalog";
import { getPvConnectionRules, resolvePvPowerLimit } from "@/config/pv-connection-rules";
import { getConnectionConfig } from "@/config/connections";
import { connectionCapacityAmount } from "@/config/connection-capacity";
import { calculateSolarSystem } from "./engine";
import type { CalculationInput } from "./types";
import type { ServiceType } from "@/config/grid";

function input(
  electrical: Partial<CalculationInput["electrical"]> & { maxAcPowerKw: number },
  countryCode = "SE",
): CalculationInput {
  return {
    location: { latitude: 59.3, longitude: 18.1, countryCode },
    resource: {
      annualKwhPerKwp: 950,
      monthlyKwhPerKwp: [20, 40, 80, 110, 130, 135, 130, 110, 75, 45, 20, 15],
    },
    consumption: { annualKwh: 40000, monthlyKwh: Array.from({ length: 12 }, () => 3333) },
    electrical,
    economics: { currency: "SEK", selfConsumedValuePerKwh: 1.5, exportValuePerKwh: 0.5 },
    selfConsumptionShare: 0.4,
    acceptedPaybackYears: 12,
    annualPriceChangeRate: 0.02,
  } as CalculationInput;
}

describe("inverter catalogue", () => {
  it("stops single-phase products at 10 kW", () => {
    const catalog = inverterCatalogFor({ serviceType: "single-phase" });
    expect(Math.max(...catalog.unitSizesKw)).toBe(10);
    expect(catalog.maxUnitCount).toBe(1);
  });

  it("keeps the G98 3.68 kW class available for single-phase services", () => {
    expect(isInverterCompatible(3.68, "single-phase")).toBe(true);
    expect(isInverterCompatible(3.68, "three-phase")).toBe(false);
  });

  it("uses a different product family for split-phase services", () => {
    expect(inverterCatalogFor({ serviceType: "split-phase", countryCode: "US" }).id).toBe(
      "na-split-phase",
    );
    expect(inverterCatalogFor({ serviceType: "split-phase", countryCode: "JP" }).id).toBe(
      "jp-split-phase",
    );
    expect(isInverterCompatible(20, "split-phase", "US")).toBe(false);
  });

  it("builds multi-unit configurations only where the market does", () => {
    const eu = buildInverterOptions(inverterCatalogFor({ serviceType: "three-phase" }), 60);
    expect(eu.every((o) => o.unitCount === 1)).toBe(true);

    const us = buildInverterOptions(
      inverterCatalogFor({ serviceType: "split-phase", countryCode: "US" }),
      20,
    );
    expect(us.some((o) => o.unitCount === 2 && o.unitKw === 9.6)).toBe(true);
    expect(Math.max(...us.map((o) => o.totalAcKw))).toBeLessThanOrEqual(20);
  });

  it("never offers a configuration above the AC ceiling", () => {
    for (const serviceType of [
      "single-phase",
      "two-phase",
      "three-phase",
      "split-phase",
    ] as ServiceType[]) {
      const options = buildInverterOptions(inverterCatalogFor({ serviceType }), 7);
      expect(options.every((o) => o.totalAcKw <= 7 + 1e-9)).toBe(true);
    }
  });
});

describe("PV rules see the electrical service", () => {
  it("applies the US busbar rule instead of the service capacity", () => {
    const limit = resolvePvPowerLimit({
      // 200 A split-phase = 48 kW of service capacity...
      connectionCapacityKw: 48,
      rules: getPvConnectionRules("US"),
      serviceType: "split-phase",
      serviceAmperageA: 200,
      voltageV: 240,
    });
    // ...but only 20 % of the busbar may be backfed.
    expect(limit.maxPvAcKw).toBeCloseTo(9.6, 6);
    expect(limit.binding).toBe("busbar-rule");
  });

  it("scales the busbar rule with a 400 A service", () => {
    const limit = resolvePvPowerLimit({
      connectionCapacityKw: 96,
      rules: getPvConnectionRules("CA"),
      serviceType: "split-phase",
      serviceAmperageA: 400,
      voltageV: 240,
    });
    expect(limit.maxPvAcKw).toBeCloseTo(19.2, 6);
  });

  it("caps German single-phase feed-in at 4.6 kW but not three-phase", () => {
    const single = resolvePvPowerLimit({
      connectionCapacityKw: 14.5,
      rules: getPvConnectionRules("DE"),
      serviceType: "single-phase",
    });
    expect(single.maxPvAcKw).toBe(4.6);
    expect(single.binding).toBe("service-pv-rule");

    const three = resolvePvPowerLimit({
      connectionCapacityKw: 43.5,
      rules: getPvConnectionRules("DE"),
      serviceType: "three-phase",
    });
    expect(three.maxPvAcKw).toBe(30);
  });

  it("reports the GB G98 threshold without enforcing it", () => {
    const limit = resolvePvPowerLimit({
      connectionCapacityKw: 18.4,
      rules: getPvConnectionRules("GB"),
      serviceType: "single-phase",
    });
    expect(limit.simplifiedProcessLimitKw).toBe(3.68);
    expect(limit.maxPvAcKw).toBe(18.4);
  });
});

describe("engine picks products that exist for the service", () => {
  it("never recommends a three-phase product on a single-phase supply", () => {
    const result = calculateSolarSystem(
      input({ maxAcPowerKw: 18.4, serviceType: "single-phase", gridVoltageV: 230 }, "PL"),
    );
    expect(result.inverterKw).toBeLessThanOrEqual(10);
    expect(isInverterCompatible(result.inverterUnitKw, "single-phase")).toBe(true);
    expect(result.inverterUnitCount).toBe(1);
  });

  it("builds a US system from split-phase units", () => {
    const result = calculateSolarSystem(
      input(
        {
          maxAcPowerKw: 48,
          pvPowerLimitKw: 9.6,
          pvLimitBinding: "busbar-rule",
          serviceType: "split-phase",
          gridVoltageV: 240,
        },
        "US",
      ),
    );
    expect(result.inverterKw).toBeLessThanOrEqual(9.6);
    expect(isInverterCompatible(result.inverterUnitKw, "split-phase", "US")).toBe(true);
    expect(result.inverterCatalogId).toBe("na-split-phase");
  });

  it("uses two units when one split-phase product cannot carry the array", () => {
    const result = calculateSolarSystem(
      input(
        {
          maxAcPowerKw: 96,
          pvPowerLimitKw: 19.2,
          pvLimitBinding: "busbar-rule",
          serviceType: "split-phase",
          gridVoltageV: 240,
        },
        "US",
      ),
    );
    expect(result.inverterUnitKw).toBeLessThanOrEqual(11.4);
    expect(result.inverterKw).toBeCloseTo(
      result.inverterUnitKw * result.inverterUnitCount,
      6,
    );
    expect(result.inverterUnitCount).toBeGreaterThan(1);
  });

  it("still uses the full three-phase ladder on a large 400 V connection", () => {
    const result = calculateSolarSystem(
      input({ maxAcPowerKw: 43.5, serviceType: "three-phase", gridVoltageV: 400 }, "SE"),
    );
    expect(result.inverterUnitCount).toBe(1);
    expect(isInverterCompatible(result.inverterUnitKw, "three-phase")).toBe(true);
  });
});

describe("contracted markets imply a phase model", () => {
  it("marks large French subscriptions as three-phase", () => {
    const fr = getConnectionConfig("FR").connectionOptions;
    const nine = fr.find((o) => connectionCapacityAmount(o.capacity) === 9)!;
    const thirtySix = fr.find((o) => connectionCapacityAmount(o.capacity) === 36)!;
    expect(nine.impliedServiceType).toBeUndefined();
    expect(thirtySix.impliedServiceType).toBe("three-phase");
    // The capacity itself stays a pure total with no pinned grid profile.
    expect(thirtySix.capacity.serviceType).toBeUndefined();
  });

  it("marks Polish subscriptions above 11 kW as three-phase", () => {
    const pl = getConnectionConfig("PL").connectionOptions;
    expect(pl.find((o) => connectionCapacityAmount(o.capacity) === 10)!.impliedServiceType).toBeUndefined();
    expect(pl.find((o) => connectionCapacityAmount(o.capacity) === 30)!.impliedServiceType).toBe(
      "three-phase",
    );
  });
});
