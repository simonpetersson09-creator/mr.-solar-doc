/* Read-only release sweep. Not part of the app build. */
import { runCalculation } from "@/lib/calc/engine";
import type { CalculationInput, CalculationResult } from "@/lib/calc/types";
import { getConnectionConfig, COUNTRY_CONNECTION_CONFIGS } from "@/config/connections";
import {
  connectionCapacityToMaxAcPowerKw,
  isValidConnectionCapacity,
} from "@/config/connection-capacity";
import { getPvConnectionRules, resolvePvPowerLimit } from "@/config/pv-connection-rules";
import { resolveEconomicsDefaults, getCountryConfig } from "@/config/countries";
import type { ServiceType } from "@/config/grid";

const countries = process.argv[2]
  ? process.argv[2].split(",")
  : Object.keys(COUNTRY_CONNECTION_CONFIGS);

const solarResources = [650, 950, 1300, 1750];
const consumptions = [1500, 4000, 12000, 40000, 150000];
const priceSets: Array<[number | null, number | null]> = [
  [0, 0],
  [0.05, 0.02],
  [1.5, 0.6],
  [6, 9], // export > buy
  [2.5, 0],
];
const paybacks = [5, 8, 10, 15, 20];

const failures: string[] = [];
let runs = 0;
let successes = 0;
const outcomes: Record<string, number> = {};
const paybackMonotony: string[] = [];

function monthly(annual: number): number[] {
  const w = [1.25, 1.15, 1.05, 0.9, 0.8, 0.7, 0.7, 0.75, 0.9, 1.05, 1.15, 1.25];
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (annual * x) / s);
}

function build(
  cc: string,
  capacityIdx: number,
  res: number,
  cons: number,
  prices: [number | null, number | null],
  payback: number,
): CalculationInput | null {
  const cfg = getConnectionConfig(cc);
  const opt = cfg.connectionOptions[capacityIdx];
  if (!opt || !isValidConnectionCapacity(opt.capacity)) return null;
  const kva = cfg.contractedKvaPowerFactor;
  const maxAcPowerKw = connectionCapacityToMaxAcPowerKw(opt.capacity, {
    ...(kva === undefined ? {} : { contractedKvaPowerFactor: kva }),
  });
  const serviceType = (opt.impliedServiceType ?? cfg.defaultServiceType) as ServiceType;
  const amp = opt.capacity.type === "amperage" ? opt.capacity.amperageA : null;
  const pv = resolvePvPowerLimit({
    connectionCapacityKw: maxAcPowerKw,
    rules: getPvConnectionRules(cc),
    serviceType,
    serviceAmperageA: amp,
    voltageV: opt.capacity.voltageV ?? cfg.defaultVoltage,
  });
  const eco = resolveEconomicsDefaults(cc, {
    selfConsumedValuePerKwh: prices[0],
    exportValuePerKwh: prices[1],
  });
  return {
    location: {
      address: "test",
      latitude: 55,
      longitude: 13,
      countryCode: cc,
      region: "",
    },
    resource: {
      annualKwhPerKwp: res,
      monthlyKwhPerKwp: monthly(res).reverse(),
      orientation: "south",
      tiltDegrees: 35,
      orientationAssumed: false,
      tiltAssumed: false,
      dataSource: "test",
      calculationDate: new Date().toISOString(),
    },
    consumption: {
      annualKwh: cons,
      monthlyKwh: monthly(cons),
      inputType: "monthly-manual",
      isEstimated: false,
    },
    electrical: {
      mainFuseAmp: amp,
      maxAcPowerKw,
      connection: opt.capacity,
      serviceType,
      gridVoltageV: opt.capacity.voltageV ?? cfg.defaultVoltage,
      gridFrequencyHz: cfg.defaultFrequencyHz,
      pvPowerLimitKw: pv.maxPvAcKw,
      pvLimitBinding: pv.binding,
      pvRulesStatus: pv.rulesStatus,
      simplifiedProcessLimitKw: pv.simplifiedProcessLimitKw,
      gridProfileStatus: cfg.status,
      gridProfileConfirmed: true,
    },
    economics: {
      selfConsumedValuePerKwh: eco.selfConsumedValuePerKwh,
      exportValuePerKwh: eco.exportValuePerKwh,
      installationCostPerKwp: eco.installationCostPerKwp,
      gridCompensationPerKwh: eco.gridCompensationPerKwh,
      gridCompensationEnabled: getCountryConfig(cc).economics.gridCompensation.enabled,
      currency: eco.currencyCode,
      valuesMissing: eco.valuesMissing,
      selfConsumedValueSource: prices[0] === null ? "standard-value" : "user-override",
      exportValueSource: prices[1] === null ? "standard-value" : "user-override",
    },
    selfConsumptionShare: 0.4,
    acceptedPaybackYears: payback,
    annualPriceChangeRate: 0.02,
    quotePrice: null,
  };
}

function check(tag: string, r: CalculationResult, input: CalculationInput) {
  const bad = (m: string) => failures.push(`${tag}: ${m}`);
  const nums: Array<[string, number]> = [
    ["installedKwp", r.installedKwp],
    ["inverterKw", r.inverterKw],
    ["dcAcRatio", r.dcAcRatio],
    ["annualProductionKwh", r.annualProductionKwh],
    ["selfConsumedKwh", r.selfConsumedKwh],
    ["exportedKwh", r.exportedKwh],
    ["totalValue", r.economics.totalValue],
    ["maxInvestment", r.investment.maxInvestment],
  ];
  for (const [k, v] of nums) {
    if (!Number.isFinite(v)) bad(`${k} not finite (${v})`);
  }
  if (r.annualProductionKwh < 0) bad("negative production");
  if (r.selfConsumedKwh < 0) bad("negative self-consumption");
  if (r.exportedKwh < 0) bad("negative export");
  if (r.selfConsumedKwh > r.annualProductionKwh + 1e-6) bad("self > production");
  if (r.selfConsumedKwh > input.consumption.annualKwh + 1e-6) bad("self > consumption");
  if (Math.abs(r.selfConsumedKwh + r.exportedKwh - r.annualProductionKwh) > 1)
    bad(
      `self+export != production (${r.selfConsumedKwh}+${r.exportedKwh} vs ${r.annualProductionKwh})`,
    );
  if (r.dcAcRatio > 1.3 + 1e-9) bad(`dcAc ${r.dcAcRatio}`);
  const binding = Math.min(r.maxAcPowerKw, r.pvPowerLimitKw);
  if (r.inverterKw > binding + 1e-6) bad(`inverter ${r.inverterKw} > binding ${binding}`);
  if (r.investment.maxInvestment < 0) bad("negative maxInvestment");
  if (r.presentation == null) bad("no presentation");
}

for (const cc of countries) {
  const cfg = getConnectionConfig(cc);
  for (let ci = 0; ci < cfg.connectionOptions.length; ci++) {
    for (const res of solarResources) {
      for (const cons of consumptions) {
        for (const prices of priceSets) {
          const invByPayback: number[] = [];
          for (const payback of paybacks) {
            const input = build(cc, ci, res, cons, prices, payback);
            if (!input) continue;
            runs++;
            const tag = `${cc}/opt${ci}/res${res}/cons${cons}/p${prices[0]}-${prices[1]}/pb${payback}`;
            let outcome;
            try {
              outcome = runCalculation(input);
            } catch (e) {
              failures.push(`${tag}: THREW ${(e as Error).message}`);
              continue;
            }
            outcomes[outcome.status] = (outcomes[outcome.status] ?? 0) + 1;
            if (outcome.status !== "success") continue;
            successes++;
            check(tag, outcome.result, input);
            invByPayback.push(outcome.result.investment.maxInvestment);
          }
          for (let i = 1; i < invByPayback.length; i++) {
            if (invByPayback[i]! < invByPayback[i - 1]! - 1e-6) {
              paybackMonotony.push(
                `${cc}/opt${ci}/res${res}/cons${cons}/p${prices[0]}-${prices[1]}: ${invByPayback.join(" -> ")}`,
              );
            }
          }
        }
      }
    }
  }
}

console.log("runs", runs, "successes", successes);
console.log("outcomes", outcomes);
console.log("invariant failures", failures.length);
console.log(failures.slice(0, 40).join("\n"));
console.log("payback monotony violations", paybackMonotony.length);
console.log(paybackMonotony.slice(0, 20).join("\n"));
