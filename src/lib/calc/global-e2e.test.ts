/**
 * DEL 4 – global end-to-end chain:
 *   country -> connection capacity -> PV rules -> engine -> result.
 * Also covers DEL 3: economic completeness must be unknown, never zero.
 */
import { describe, expect, it } from "vitest";
import {
  connectionCapacityToMaxAcPowerKw,
  type ConnectionCapacity,
} from "@/config/connection-capacity";
import { getConnectionConfig } from "@/config/connections";
import { currencyForCountry, resolveEconomicsDefaults, getCountryConfig } from "@/config/countries";
import { getPvConnectionRules, resolvePvPowerLimit } from "@/config/pv-connection-rules";
import { runCalculation } from "./engine";
import type { CalculationOutcome } from "./types";

const MONTHLY_YIELD = [15, 35, 75, 110, 135, 140, 135, 110, 70, 40, 18, 12];

function runForCountry(countryCode: string, capacity: ConnectionCapacity) {
  const connection = getConnectionConfig(countryCode);
  const maxAcPowerKw = connectionCapacityToMaxAcPowerKw(capacity, {
    ...(connection.contractedKvaPowerFactor === undefined
      ? {}
      : { contractedKvaPowerFactor: connection.contractedKvaPowerFactor }),
  });
  const pvLimit = resolvePvPowerLimit({
    connectionCapacityKw: maxAcPowerKw,
    rules: getPvConnectionRules(countryCode),
  });
  const economics = resolveEconomicsDefaults(countryCode, {
    selfConsumedValuePerKwh: null,
    exportValuePerKwh: null,
  });
  const outcome: CalculationOutcome = runCalculation({
    location: { latitude: 55, longitude: 12, countryCode },
    resource: {
      annualKwhPerKwp: MONTHLY_YIELD.reduce((a, b) => a + b, 0),
      monthlyKwhPerKwp: MONTHLY_YIELD,
    },
    consumption: {
      annualKwh: 18000,
      monthlyKwh: Array.from({ length: 12 }, () => 1500),
    },
    electrical: {
      maxAcPowerKw,
      connection: capacity,
      pvPowerLimitKw: pvLimit.maxPvAcKw,
      pvLimitBinding: pvLimit.binding,
      pvRulesStatus: pvLimit.rulesStatus,
      gridProfileStatus: connection.status,
      gridProfileConfirmed: true,
    },
    economics: {
      selfConsumedValuePerKwh: economics.selfConsumedValuePerKwh,
      exportValuePerKwh: economics.exportValuePerKwh,
      installationCostPerKwp: economics.installationCostPerKwp,
      gridCompensationPerKwh: economics.gridCompensationPerKwh,
      gridCompensationEnabled:
        getCountryConfig(countryCode).economics.gridCompensation.enabled,
      currency: economics.currencyCode,
      valuesMissing: economics.valuesMissing,
    },
    selfConsumptionShare: 0.4,
    acceptedPaybackYears: 12,
    annualPriceChangeRate: 0.02,
    inverterSizesKw: [3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50],
  });
  return { outcome, pvLimit, maxAcPowerKw };
}

const AMPERAGE_MARKETS: Array<[string, number, number]> = [
  ["SE", 25, 400],
  ["FI", 25, 400],
  ["DK", 25, 400],
  ["DE", 35, 400],
  ["AT", 25, 400],
  ["PL", 25, 400],
  ["CZ", 25, 400],
  ["EE", 25, 400],
  ["US", 100, 240],
  ["CA", 100, 240],
];

describe("global end-to-end chain", () => {
  it.each(AMPERAGE_MARKETS)("%s produces a coherent result", (country, amps, voltage) => {
    const serviceType = voltage === 240 ? "split-phase" : "three-phase";
    const { outcome, pvLimit, maxAcPowerKw } = runForCountry(country, {
      type: "amperage",
      amperageA: amps,
      voltageV: voltage,
      serviceType,
      frequencyHz: voltage === 240 ? 60 : 50,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const r = outcome.result;

    // No silent NaN anywhere in the headline numbers.
    for (const value of [
      r.installedKwp,
      r.inverterKw,
      r.annualProductionKwh,
      r.pvPowerLimitKw,
      r.gridConnectionLimitKw,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }

    // The AC ceiling is never above either individual limit.
    expect(r.inverterKw).toBeLessThanOrEqual(pvLimit.maxPvAcKw + 1e-9);
    expect(r.gridConnectionLimitKw).toBeCloseTo(maxAcPowerKw, 6);
    expect(r.pvPowerLimitKw).toBeLessThanOrEqual(maxAcPowerKw + 1e-9);

    // Currency comes from the country, never from the UI language.
    expect(r.economics.currency).toBe(currencyForCountry(country));

    // Energy balance holds.
    expect(r.selfConsumption.kwh + r.exported.kwh).toBeCloseTo(r.annualProductionKwh, 3);
  });

  it("kVA markets go through the documented power-factor assumption", () => {
    const { outcome, maxAcPowerKw } = runForCountry("FR", {
      type: "contracted-kva",
      kva: 12,
    });
    expect(maxAcPowerKw).toBeCloseTo(12, 6);
    expect(outcome.ok).toBe(true);
  });
});

describe("economics completeness (unknown is not zero)", () => {
  it("marks a market without verified prices as incomplete, not free", () => {
    const { outcome } = runForCountry("ZZ", {
      type: "amperage",
      amperageA: 25,
      voltageV: 400,
      serviceType: "three-phase",
      frequencyHz: 50,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const r = outcome.result;
    expect(r.economicsStatus).toBe("incomplete");
    expect(r.economics.availability.totalsComplete).toBe(false);
    expect(r.notes).toContain("economic-values-missing");
    // The technical recommendation still stands on its own.
    expect(r.installedKwp).toBeGreaterThan(0);
  });

  it("keeps a verified market complete", () => {
    const { outcome } = runForCountry("SE", {
      type: "amperage",
      amperageA: 25,
      voltageV: 400,
      serviceType: "three-phase",
      frequencyHz: 50,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.economicsStatus).toBe("complete");
    expect(outcome.result.economics.availability.selfConsumedValue).toBe("available");
  });
});
