/* Temporary verification script. Not part of the app build. */
import { writeFileSync } from "node:fs";
import { runCalculation } from "@/lib/calc/engine";
import { calculateMaxInvestment } from "@/lib/calc/payback";
import type { CalculationInput } from "@/lib/calc/types";
import { getConnectionConfig, COUNTRY_CONNECTION_CONFIGS } from "@/config/connections";
import { connectionCapacityToMaxAcPowerKw } from "@/config/connection-capacity";
import { getPvConnectionRules, resolvePvPowerLimit } from "@/config/pv-connection-rules";
import { resolveEconomicsDefaults, getCountryConfig } from "@/config/countries";
import type { ServiceType } from "@/config/grid";
import { generateReportBlob, type ReportLabels } from "@/services/solar-report-service";
import { sv } from "@/i18n/locales/sv";

const W = [0.25, 0.45, 0.8, 1.1, 1.35, 1.4, 1.38, 1.2, 0.9, 0.6, 0.35, 0.22];
const monthlyRes = (annual: number) => {
  const s = W.reduce((a, b) => a + b, 0);
  return W.map((x) => (annual * x) / s);
};
const monthlyCons = (annual: number) => {
  const w = [1.25, 1.15, 1.05, 0.9, 0.8, 0.7, 0.7, 0.75, 0.9, 1.05, 1.15, 1.25];
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (annual * x) / s);
};

interface Opts {
  cc: string;
  optIdx?: number | "default";
  res?: number;
  cons?: number;
  payback?: number;
  share?: number;
  shareUserSet?: boolean;
  priceRate?: number;
  prices?: [number | null, number | null];
}

function build(o: Opts): CalculationInput {
  const cfg = getConnectionConfig(o.cc);
  const opt =
    o.optIdx === undefined || o.optIdx === "default"
      ? cfg.connectionOptions.find((x) => x.id === cfg.defaultConnection) ?? cfg.connectionOptions[Math.floor(cfg.connectionOptions.length / 2)]!
      : cfg.connectionOptions[o.optIdx]!;
  const kva = cfg.contractedKvaPowerFactor;
  const maxAcPowerKw = connectionCapacityToMaxAcPowerKw(opt.capacity, {
    ...(kva === undefined ? {} : { contractedKvaPowerFactor: kva }),
  });
  const serviceType = (opt.impliedServiceType ?? cfg.defaultServiceType) as ServiceType;
  const amp = opt.capacity.type === "amperage" ? opt.capacity.amperageA : null;
  const pv = resolvePvPowerLimit({
    connectionCapacityKw: maxAcPowerKw,
    rules: getPvConnectionRules(o.cc),
    serviceType,
    serviceAmperageA: amp,
    voltageV: opt.capacity.voltageV ?? cfg.defaultVoltage,
  });
  const prices = o.prices ?? [null, null];
  const eco = resolveEconomicsDefaults(o.cc, {
    selfConsumedValuePerKwh: prices[0],
    exportValuePerKwh: prices[1],
  });
  const res = o.res ?? 1000;
  const cons = o.cons ?? 8000;
  return {
    location: { address: "test", latitude: 50, longitude: 10, countryCode: o.cc, region: "" },
    resource: {
      annualKwhPerKwp: res,
      monthlyKwhPerKwp: monthlyRes(res),
      orientation: "south",
      tiltDegrees: 35,
      orientationAssumed: false,
      tiltAssumed: false,
      dataSource: "test",
      calculationDate: "2026-10-04",
    },
    consumption: { annualKwh: cons, monthlyKwh: monthlyCons(cons), inputType: "monthly-manual", isEstimated: false },
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
      gridCompensationEnabled: getCountryConfig(o.cc).economics.gridCompensation.enabled,
      currency: eco.currencyCode,
      valuesMissing: eco.valuesMissing,
      selfConsumedValueSource: prices[0] === null ? "standard-value" : "user-override",
      exportValueSource: prices[1] === null ? "standard-value" : "user-override",
    },
    selfConsumptionShare: o.share ?? 0.4,
    selfConsumptionShareIsUserSet: o.shareUserSet ?? false,
    acceptedPaybackYears: o.payback ?? 10,
    annualPriceChangeRate: o.priceRate ?? 0.02,
    quotePrice: null,
  } as CalculationInput;
}

const out: string[] = [];
const fails: string[] = [];
const log = (s: string) => out.push(s);
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 1e-9);

// 1. All countries x 5/10/15 years, investment vs. independent sum of year values.
const countries = Object.keys(COUNTRY_CONNECTION_CONFIGS);
log("| Land | Status | Värde år 1 | 5 år | 10 år | 15 år | Summa-kontroll | Ökar |");
log("|---|---|---|---|---|---|---|---|");
let okCountries = 0;
for (const cc of countries) {
  const inv: number[] = [];
  let status = "";
  let y1 = 0;
  let sumOk = true;
  if (getConnectionConfig(cc).connectionOptions.length === 0) {
    log(`| ${cc} | inga fasta säkringsval (manuell inmatning) | | | | | | |`);
    continue;
  }
  for (const pb of [5, 10, 15]) {
    const o = runCalculation(build({ cc, payback: pb }));
    status = o.status;
    if (o.status !== "success") break;
    const r = o.result;
    y1 = r.lifetime.years[0]!.economicValue;
    // Separate summation: first pb years of the engine's own year values.
    const manual = r.lifetime.years.slice(0, pb).reduce((s, y) => s + y.economicValue, 0);
    if (!near(r.investment.maxInvestment, manual)) {
      sumOk = false;
      fails.push(`${cc} pb${pb}: maxInvestment ${r.investment.maxInvestment} != sum ${manual}`);
    }
    if (r.investment.acceptedPaybackYears !== pb) fails.push(`${cc}: payback ${pb} lost`);
    // Not simply year1 x years when value changes over time.
    const flat = y1 * pb;
    if (pb > 1 && near(r.investment.maxInvestment, flat) && !near(r.lifetime.years[1]!.economicValue, y1))
      fails.push(`${cc} pb${pb}: flat multiplication used`);
    inv.push(r.investment.maxInvestment);
  }
  const increasing = inv.length === 3 && inv[0]! < inv[1]! && inv[1]! < inv[2]!;
  if (inv.length === 3 && y1 > 0 && !increasing) fails.push(`${cc}: not increasing ${inv.join(",")}`);
  if (status === "success") okCountries++;
  else fails.push(`${cc}: status ${status}`);
  const f = (n: number | undefined) => (n == null ? "–" : Math.round(n).toLocaleString("sv-SE"));
  log(`| ${cc} | ${status} | ${f(y1)} | ${f(inv[0])} | ${f(inv[1])} | ${f(inv[2])} | ${sumOk ? "ok" : "FEL"} | ${increasing ? "ja" : "nej"} |`);
}
log(`\nLänder med lyckad beräkning: ${okCountries}/${countries.length}`);

// 2. Empty / invalid / zero benefit.
const edge: Array<[string, () => unknown]> = [
  ["payback NaN", () => calculateMaxInvestment(1000, Number.NaN).maxInvestment],
  ["payback 0", () => calculateMaxInvestment(1000, 0).maxInvestment],
  ["payback -5", () => calculateMaxInvestment(1000, -5).maxInvestment],
  ["value NaN", () => calculateMaxInvestment(Number.NaN, 10).maxInvestment],
  ["value 0", () => calculateMaxInvestment(0, 10).maxInvestment],
  ["quote 0 -> null", () => calculateMaxInvestment(1000, 10, 0).quotePrice],
  ["quote with value 0 -> payback null", () => calculateMaxInvestment(0, 10, 50000).quotePaybackYears],
  ["fractional 7.5 yrs", () => calculateMaxInvestment(1000, 7.5, null, Array(25).fill(1000)).maxInvestment],
];
log("\n| Kantfall | Resultat |\n|---|---|");
for (const [name, fn] of edge) log(`| ${name} | ${String(fn())} |`);
const zero = runCalculation(build({ cc: "SE", prices: [0, 0] }));
log(`| Motor SE med 0 kr/kWh | status ${zero.status}, maxInvestment ${zero.status === "success" ? zero.result.investment.maxInvestment : "–"}, economicsStatus ${zero.status === "success" ? zero.result.economicsStatus : "–"} |`);
const empty = runCalculation({ ...build({ cc: "SE" }), consumption: { annualKwh: 0, monthlyKwh: null } } as CalculationInput);
log(`| Motor SE förbrukning 0 | status ${empty.status} |`);
const badPb = runCalculation(build({ cc: "SE", payback: Number.NaN }));
log(`| Motor SE återbetalning NaN | status ${badPb.status} |`);

// 3. Scenario A vs C through inputs the app supports.
const A = runCalculation(build({ cc: "SE", cons: 6000, priceRate: 0 }));
const C = runCalculation(build({ cc: "SE", cons: 20000, priceRate: 0.04, share: 0.7, shareUserSet: true, payback: 15 }));
if (A.status === "success" && C.status === "success") {
  const a = A.result, c = C.result;
  log(`\nScenario A (6 000 kWh, 0 %/år, automatisk andel, 10 år): ${a.installedKwp} kWp, prod ${Math.round(a.annualProductionKwh)}, egen ${Math.round(a.selfConsumedKwh)}, export ${Math.round(a.exportedKwh)}, värde år 1 ${Math.round(a.economics.totalValue)}, max ${Math.round(a.investment.maxInvestment)}`);
  log(`Scenario C (20 000 kWh, 4 %/år, egen andel 70 %, 15 år): ${c.installedKwp} kWp, prod ${Math.round(c.annualProductionKwh)}, egen ${Math.round(c.selfConsumedKwh)}, export ${Math.round(c.exportedKwh)}, värde år 1 ${Math.round(c.economics.totalValue)}, max ${Math.round(c.investment.maxInvestment)}`);
  if (a.investment.maxInvestment === c.investment.maxInvestment) fails.push("A == C");
}

// 4. Inverter-limited (clipping) case.
const p1 = runCalculation(build({ cc: "SE", optIdx: 0, res: 1100, cons: 30000 }));
if (p1.status === "success") {
  const r1 = p1.result;
  const model = { dcAcRatio: r1.dcAcRatio, monthlyLossShare: W.map((w) => 0.06 * w / 1.4), annualLossShare: 0.04, dataSource: "syntetisk", year: 2023 };
  const p2 = runCalculation({ ...build({ cc: "SE", optIdx: 0, res: 1100, cons: 30000 }), clipping: model });
  if (p2.status === "success") {
    const r2 = p2.result;
    log(`\nVäxelriktarbegränsning (SE minsta säkring): ${r1.installedKwp} kWp på ${r1.inverterKw} kW (DC/AC ${r1.dcAcRatio.toFixed(2)}). Produktion utan klippning ${Math.round(r1.annualProductionKwh)}, med ${Math.round(r2.annualProductionKwh)} kWh; maxinvestering ${Math.round(r1.investment.maxInvestment)} → ${Math.round(r2.investment.maxInvestment)}`);
    if (!(r2.annualProductionKwh < r1.annualProductionKwh)) fails.push("clipping did not reduce production");
    if (!(r2.investment.maxInvestment < r1.investment.maxInvestment)) fails.push("clipping did not reduce investment");
  } else fails.push(`clipping pass2 ${p2.status}`);
}

// 5. Canada, every service option.
log("\n| Kanada säkring | Status | Tillåten solcellseffekt | Minsta växelriktare |\n|---|---|---|---|");
const ca = getConnectionConfig("CA");
ca.connectionOptions.forEach((opt, i) => {
  const o = runCalculation(build({ cc: "CA", optIdx: i }));
  if (o.status === "grid-too-small") {
    log(`| ${opt.id} | för liten | ${o.maxAcPowerKw.toFixed(2)} kW | ${o.minimumSupportedInverterKw} kW |`);
    if (!(o.minimumSupportedInverterKw > 0)) fails.push("CA min inverter 0");
  } else if (o.status === "success") log(`| ${opt.id} | ok | ${o.result.pvPowerLimitKw.toFixed(2)} kW | ${o.result.inverterKw} kW vald |`);
  else log(`| ${opt.id} | ${o.status} | | |`);
});

// 6. Real PDF for SE default and compare to result.
const resolve = (path: string): unknown => path.split(".").reduce<any>((o, k) => o?.[k], sv);
const rt = (k: string) => (typeof resolve(k) === "string" ? (resolve(k) as string) : k);
const pdfIn = runCalculation(build({ cc: "SE", cons: 12000, payback: 12 }));
if (pdfIn.status === "success") {
  const r = pdfIn.result;
  const labels = {
    title: rt("report.title"), appName: rt("app.name"), summary: rt("report.summary"), technical: rt("report.technical"),
    economicSummary: rt("report.economicSummary"), sizing: rt("report.sizing"), production: rt("report.production"),
    consumption: rt("report.consumption"), economics: rt("report.economics"), assumptions: rt("report.assumptions"),
    disclaimer: rt("report.disclaimer"), generated: rt("report.generated"), months: resolve("months.short") as string[],
    rationale: "", coverageNote: rt("result.coverageNote"), paybackNote: rt("result.paybackInfo"), quoteNote: rt("result.quoteNote"),
    loadProfile: { label: rt("result.loadProfileLabel"), value: "", note: "" },
    selfConsumptionMode: { label: rt("result.selfConsumptionModeLabel"), value: rt("result.selfConsumptionModeAuto"), note: null },
    selfConsumptionCappedNote: null, clippingNote: null, shadingNote: rt("result.shadingNotIncludedNote"),
    consumptionSource: rt("result.consumptionSource.monthly-manual"), consumptionShape: null,
    chartProduction: rt("report.chartProduction"), chartConsumption: rt("report.chartConsumption"),
    origin: resolve("report.origin"), fields: resolve("report.fields"),
    economicsRequiresPrice: rt("result.economicsRequiresPrice"), economicsRequiresPriceShort: rt("result.economicsRequiresPriceShort"),
    gridUnverifiedTitle: rt("result.gridUnverifiedTitle"), gridUnverifiedWarning: rt("result.gridUnverifiedWarning"),
    pvLimitLabel: rt("result.pvLimitLabel"), bindingLimitLabel: rt("result.bindingLimitLabel"), bindingLimitValue: "",
    limitReason: null, simplifiedProcessNote: null, installerChecklistTitle: rt("report.installerChecklistTitle"),
    installerChecklistItems: resolve("report.installerChecklistItems"), faqTitle: rt("report.faqTitle"), faqItems: resolve("report.faqItems"),
  } as unknown as ReportLabels;
  const blob = generateReportBlob({ result: r, labels, locale: "sv-SE" });
  const buf = Buffer.from(await blob.arrayBuffer());
  writeFileSync("/tmp/verify/report-se.pdf", buf);
  writeFileSync(
    "/tmp/verify/expected.json",
    JSON.stringify({
      production: r.presentation.annualProductionKwh ?? Math.round(r.annualProductionKwh),
      self: Math.round(r.selfConsumedKwh), export: Math.round(r.exportedKwh),
      value: Math.round(r.economics.totalValue), payback: r.investment.acceptedPaybackYears,
      maxInvestmentRounded: r.investment.maxInvestmentRounded, presentation: r.presentation,
    }, null, 1),
  );
}

writeFileSync("/tmp/verify/report.md", out.join("\n"));
console.log(out.join("\n"));
console.log("\nFAILS", fails.length, "\n" + fails.join("\n"));
