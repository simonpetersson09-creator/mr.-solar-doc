/* Read-only targeted scenario dump. */
import { runCalculation } from "@/lib/calc/engine";
import { getConnectionConfig } from "@/config/connections";
import { connectionCapacityToMaxAcPowerKw } from "@/config/connection-capacity";
import { getPvConnectionRules, resolvePvPowerLimit } from "@/config/pv-connection-rules";
import { resolveEconomicsDefaults, getCountryConfig } from "@/config/countries";
import type { ServiceType } from "@/config/grid";

function monthly(a: number) {
  const w = [1.25, 1.15, 1.05, 0.9, 0.8, 0.7, 0.7, 0.75, 0.9, 1.05, 1.15, 1.25];
  const s = w.reduce((x, y) => x + y, 0);
  return w.map((x) => (a * x) / s);
}

const cases: Array<{ cc: string; label: string; res: number; cons: number }> = [
  { cc: "SE", label: "SE", res: 950, cons: 20000 },
  { cc: "DK", label: "DK", res: 1000, cons: 20000 },
  { cc: "DE", label: "DE", res: 1050, cons: 20000 },
  { cc: "PL", label: "PL", res: 1000, cons: 20000 },
  { cc: "GB", label: "GB", res: 950, cons: 20000 },
  { cc: "US", label: "US", res: 1500, cons: 20000 },
  { cc: "CA", label: "CA", res: 1200, cons: 20000 },
  { cc: "JP", label: "JP", res: 1250, cons: 20000 },
  { cc: "CH", label: "CH", res: 1100, cons: 20000 },
];

for (const c of cases) {
  const cfg = getConnectionConfig(c.cc);
  console.log(
    `\n=== ${c.label} (${cfg.status}, ${cfg.capacityInputType}, default ${cfg.defaultServiceType} ${cfg.defaultVoltage}V) ===`,
  );
  for (const opt of cfg.connectionOptions) {
    const kva = cfg.contractedKvaPowerFactor;
    const maxAc = connectionCapacityToMaxAcPowerKw(opt.capacity, {
      ...(kva === undefined ? {} : { contractedKvaPowerFactor: kva }),
    });
    const st = (opt.impliedServiceType ?? cfg.defaultServiceType) as ServiceType;
    const amp = opt.capacity.type === "amperage" ? opt.capacity.amperageA : null;
    const pv = resolvePvPowerLimit({
      connectionCapacityKw: maxAc,
      rules: getPvConnectionRules(c.cc),
      serviceType: st,
      serviceAmperageA: amp,
      voltageV: opt.capacity.voltageV ?? cfg.defaultVoltage,
    });
    const eco = resolveEconomicsDefaults(c.cc, {
      selfConsumedValuePerKwh: null,
      exportValuePerKwh: null,
    });
    const out = runCalculation({
      location: { address: "", latitude: 55, longitude: 13, countryCode: c.cc, region: "" },
      resource: {
        annualKwhPerKwp: c.res,
        monthlyKwhPerKwp: monthly(c.res),
        orientation: "south",
        tiltDegrees: 35,
        orientationAssumed: false,
        tiltAssumed: false,
        dataSource: "t",
        calculationDate: "",
      },
      consumption: {
        annualKwh: c.cons,
        monthlyKwh: monthly(c.cons),
        inputType: "monthly-manual",
      },
      electrical: {
        mainFuseAmp: amp,
        maxAcPowerKw: maxAc,
        connection: opt.capacity,
        serviceType: st,
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
        gridCompensationEnabled: getCountryConfig(c.cc).economics.gridCompensation.enabled,
        currency: eco.currencyCode,
        valuesMissing: eco.valuesMissing,
      },
      selfConsumptionShare: 0.4,
      acceptedPaybackYears: 10,
      annualPriceChangeRate: 0.02,
    });
    const id = opt.id.padEnd(16);
    if (out.status !== "success") {
      console.log(`${id} maxAc=${maxAc.toFixed(2)} -> ${out.status}`);
      continue;
    }
    const r = out.result;
    console.log(
      `${id} svc=${st.padEnd(13)} maxAc=${maxAc.toFixed(2).padStart(7)} pvLimit=${String(r.pvPowerLimitKw).padStart(7)} bind=${String(r.pvLimitBinding).padEnd(18)} simpl=${String(r.simplifiedProcessLimitKw)}/${r.aboveSimplifiedProcessLimit} inv=${r.inverterKw}(${r.inverterUnitCount}x${r.inverterUnitKw}) kWp=${r.installedKwp.toFixed(2)} n=${r.panelCount} dcac=${r.dcAcRatio.toFixed(3)} basis=${r.sizingBasis} econ=${r.economicsStatus} maxInv=${Math.round(r.investment.maxInvestment)}`,
    );
  }
}
