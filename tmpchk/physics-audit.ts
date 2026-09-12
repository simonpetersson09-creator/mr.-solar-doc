/**
 * Independent physics/math audit of the calculation model.
 * Read-only: imports production code, computes hand-derived expectations,
 * and probes adversarial cases the model should or should not react to.
 */
import {
  modelSelfConsumptionShare,
  resolveSelfConsumptionShare,
  splitProduction,
} from "@/lib/calc/self-consumption";
import { buildLifetimeProjection, performanceFactorForYear } from "@/lib/calc/degradation";
import { calculateEconomicValue } from "@/lib/calc/electricity-price";
import { calculateMaxInvestment } from "@/lib/calc/payback";

const issues: string[] = [];
const notes: string[] = [];
const ok = (label: string, got: number, expected: number, tol = 1e-9) => {
  const pass = Math.abs(got - expected) <= tol * Math.max(1, Math.abs(expected));
  console.log(`${pass ? "OK  " : "FAIL"} ${label}: got ${got}, expected ${expected}`);
  if (!pass) issues.push(`${label}: got ${got}, expected ${expected}`);
};

console.log("\n== A. Share formula, hand-derived ==");
const hand = (r: number, f = 1) => 0.4 * Math.pow(r, -0.6) * f;
ok("ratio 1.0 mixed", modelSelfConsumptionShare(10000, 10000), hand(1));
ok("ratio 0.5 mixed", modelSelfConsumptionShare(5000, 10000), hand(0.5));
ok("ratio 2.0 mixed", modelSelfConsumptionShare(20000, 10000), hand(2));
ok("ratio 1.0 daytime", modelSelfConsumptionShare(10000, 10000, "daytime"), hand(1, 1.3));
ok("ratio 1.0 evening", modelSelfConsumptionShare(10000, 10000, "evening"), hand(1, 0.85));

console.log("\n== B. Clamp breakpoints (where the curve stops being physics) ==");
const rCeil = Math.pow(0.4 / 0.85, 1 / 0.6); // raw = 0.85
const rFloor = Math.pow(0.4 / 0.05, 1 / 0.6); // raw = 0.05
console.log(`ceiling 85 % binds for ratio <= ${rCeil.toFixed(4)}`);
console.log(`floor 5 % binds for ratio >= ${rFloor.toFixed(4)}`);
ok("at ceiling breakpoint share = 0.85", modelSelfConsumptionShare(rCeil * 1000, 1000), 0.85, 1e-6);
ok("just above breakpoint continuous", modelSelfConsumptionShare(rCeil * 1000 * 1.001, 1000), hand(rCeil * 1.001), 1e-6);

console.log("\n== C. Monotonicity / no perverse effects (self-consumed kWh) ==");
// analytic: selfKwh = 0.4 * P^0.4 * C^0.6 in the unclamped band
let prevSelf = -1;
let monotone = true;
for (let p = 500; p <= 60000; p += 500) {
  const s = splitProduction(p, modelSelfConsumptionShare(p, 20000), 20000);
  if (s.selfConsumptionKwh + 1e-9 < prevSelf) monotone = false;
  prevSelf = s.selfConsumptionKwh;
}
console.log(`${monotone ? "OK  " : "FAIL"} selfConsumed kWh never falls when production grows`);
if (!monotone) issues.push("selfConsumed kWh not monotone in production");
const analytic = 0.4 * Math.pow(12000, 0.4) * Math.pow(20000, 0.6);
ok("selfKwh = 0.4 P^0.4 C^0.6 (P=12000, C=20000)", splitProduction(12000, modelSelfConsumptionShare(12000, 20000), 20000).selfConsumptionKwh, analytic, 1e-9);
// export monotone in production?
let exportMonotone = true;
let prevExp = -1;
for (let p = 500; p <= 60000; p += 500) {
  const s = splitProduction(p, modelSelfConsumptionShare(p, 20000), 20000);
  if (s.exportedKwh + 1e-9 < prevExp) exportMonotone = false;
  prevExp = s.exportedKwh;
}
console.log(`${exportMonotone ? "OK  " : "FAIL"} export never falls when production grows`);
if (!exportMonotone) issues.push("export not monotone in production");

console.log("\n== D. Limits at zero ==");
console.log("P=0:", JSON.stringify(splitProduction(0, modelSelfConsumptionShare(0, 20000), 20000)));
console.log("C=0:", JSON.stringify(splitProduction(10000, modelSelfConsumptionShare(10000, 0), 0)));
console.log("share at P->0 (model):", modelSelfConsumptionShare(1e-6, 20000), "(clamped ceiling)");

console.log("\n== E. Energy balance ==");
for (const [p, c] of [[11224, 20000], [30000, 5000], [1000, 40000]] as const) {
  const share = modelSelfConsumptionShare(p, c);
  const s = splitProduction(p, share, c);
  const bal = Math.abs(s.selfConsumptionKwh + s.exportedKwh - p);
  const imp = c - s.selfConsumptionKwh;
  console.log(`P=${p} C=${c}: self=${s.selfConsumptionKwh.toFixed(1)} exp=${s.exportedKwh.toFixed(1)} balance err=${bal.toExponential(2)} implied import=${imp.toFixed(1)}`);
  if (bal > 1e-9) issues.push(`energy balance broken at P=${p}`);
  if (imp < -1e-9) issues.push(`negative implied import at P=${p}`);
}

console.log("\n== F. Adversarial: same annual load, all at night vs all midday ==");
const night = resolveSelfConsumptionShare({ annualProductionKwh: 11224, annualConsumptionKwh: 20000, profileClass: "evening" });
const day = resolveSelfConsumptionShare({ annualProductionKwh: 11224, annualConsumptionKwh: 20000, profileClass: "daytime" });
console.log(`evening=${night.share.toFixed(4)} daytime=${day.share.toFixed(4)} ratio=${(day.share / night.share).toFixed(3)} (fixed 1.3/0.85 = ${(1.3 / 0.85).toFixed(3)})`);
notes.push("Time-of-day sensitivity is exactly the fixed factor ratio 1.529, independent of site, season and array size.");

console.log("\n== G. Adversarial: seasonal mismatch, identical annual totals ==");
const prodShape = [20, 38, 78, 110, 135, 140, 135, 110, 75, 40, 18, 12];
const scale = 11224 / prodShape.reduce((a, b) => a + b, 0);
const monthlyProd = prodShape.map((v) => v * scale);
const flatCons = Array.from({ length: 12 }, () => 20000 / 12);
const winterCons = [3600, 3200, 2400, 1400, 700, 500, 500, 600, 1100, 2000, 3000, 1000];
const summerCons = [500, 500, 700, 1300, 2400, 3400, 3600, 3200, 2200, 1200, 600, 400];
for (const [label, cons] of [["flat", flatCons], ["winter-heavy", winterCons], ["summer-heavy", summerCons]] as const) {
  const sum = cons.reduce((a, b) => a + b, 0);
  const r = resolveSelfConsumptionShare({
    annualProductionKwh: 11224,
    annualConsumptionKwh: sum,
    monthlyProductionKwh: monthlyProd,
    monthlyConsumptionKwh: [...cons],
  });
  const overlap = monthlyProd.reduce((s, p, i) => s + Math.min(p, cons[i]!), 0) / 11224;
  console.log(`${label}: annualC=${sum} share=${r.share.toFixed(4)} monthlyUpperBound=${r.monthlyUpperBound?.toFixed(4)} (monthly overlap ${overlap.toFixed(4)})`);
}

console.log("\n== H. Manual override vs monthly physics ==");
const manual = resolveSelfConsumptionShare({
  annualProductionKwh: 11224,
  annualConsumptionKwh: 20000,
  userShare: 0.95,
  userSet: true,
  monthlyProductionKwh: monthlyProd,
  monthlyConsumptionKwh: summerCons,
});
const manualSplit = splitProduction(11224, manual.share, 20000);
const monthlyPossible = monthlyProd.reduce((s, p, i) => s + Math.min(p, summerCons[i]!), 0);
console.log(`manual share=${manual.share} -> self=${manualSplit.selfConsumptionKwh.toFixed(0)} kWh; monthly-overlap ceiling=${monthlyPossible.toFixed(0)} kWh`);
if (manualSplit.selfConsumptionKwh > monthlyPossible + 1) {
  notes.push(`Manual override can exceed even the optimistic monthly overlap ceiling (${manualSplit.selfConsumptionKwh.toFixed(0)} > ${monthlyPossible.toFixed(0)} kWh).`);
}

console.log("\n== I. Lifetime projection, hand-checked ==");
const proj = buildLifetimeProjection({
  firstYearProductionKwh: 11224,
  selfConsumptionShare: 0.5,
  selfConsumedValuePerKwh: 1.44,
  exportValuePerKwh: 0.6,
  annualConsumptionKwh: 20000,
  periodYears: 30,
  annualDegradationRate: 0.005,
  annualPriceChangeRate: 0.02,
});
ok("year 1 performance factor", proj.years[0]!.performanceFactor, 1);
ok("year 30 performance factor", proj.years[29]!.performanceFactor, Math.pow(0.995, 29));
ok("year 1 price factor", proj.years[0]!.priceFactor, 1);
ok("year 30 price factor", proj.years[29]!.priceFactor, Math.pow(1.02, 29));
const handProd = 11224 * (1 - Math.pow(0.995, 30)) / (1 - 0.995);
ok("total production = geometric sum", proj.totalProductionKwh, handProd, 1e-12);
const y1 = 0.5 * 11224 * 1.44 + 0.5 * 11224 * 0.6;
ok("year 1 economic value", proj.years[0]!.economicValue, y1, 1e-12);
const handValue = y1 * (1 - Math.pow(0.995 * 1.02, 30)) / (1 - 0.995 * 1.02);
ok("total value = geometric sum (fixed share)", proj.totalEconomicValue, handValue, 1e-12);
ok("economic value formula", calculateEconomicValue({ selfConsumptionKwh: 5612, exportedKwh: 5612, selfConsumedValuePerKwh: 1.44, exportValuePerKwh: 0.6 }).totalValue, 5612 * 1.44 + 5612 * 0.6, 1e-12);

console.log("\n== J. Max investment / payback indexing ==");
const values = proj.years.map((y) => y.economicValue);
const maxInv = calculateMaxInvestment(values[0]!, 12, null, values);
const roundTrip = calculateMaxInvestment(values[0]!, 12, maxInv.maxInvestment, values);
const hand12 = values.slice(0, 12).reduce((a, b) => a + b, 0);
ok("max investment = sum of first 12 escalated years", maxInv.maxInvestment, hand12, 1e-9);
const flat12 = values[0]! * 12;
ok("payback of that investment returns 12 years", roundTrip.quotePaybackYears ?? -1, 12, 1e-9);
console.log(`nominal-escalated 12 y: ${hand12.toFixed(0)} vs flat year-1 x12: ${flat12.toFixed(0)} (+${((hand12 / flat12 - 1) * 100).toFixed(1)} % from escalation, undiscounted)`);

console.log("\n== K. Dynamic share vs degradation direction ==");
const dyn = buildLifetimeProjection({
  firstYearProductionKwh: 11224,
  selfConsumptionShare: modelSelfConsumptionShare(11224, 20000),
  selfConsumptionShareForProduction: (p) => modelSelfConsumptionShare(p, 20000),
  selfConsumedValuePerKwh: 1.44,
  exportValuePerKwh: 0.6,
  annualConsumptionKwh: 20000,
  periodYears: 30,
  annualDegradationRate: 0.005,
  annualPriceChangeRate: 0,
});
console.log(`share y1=${(dyn.years[0]!.selfConsumptionKwh / dyn.years[0]!.productionKwh).toFixed(4)} y30=${(dyn.years[29]!.selfConsumptionKwh / dyn.years[29]!.productionKwh).toFixed(4)} (should rise slightly)`);
console.log(`self kWh y1=${dyn.years[0]!.selfConsumptionKwh.toFixed(0)} y30=${dyn.years[29]!.selfConsumptionKwh.toFixed(0)} (should fall)`);

console.log("\n== L. Hourly-resolution counterexample (what the annual model cannot see) ==");
// One synthetic day: identical daily production and consumption totals,
// load concentrated at night vs at midday. Physics: self = ∫min(P,L).
const prodDay = Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 18 ? Math.sin(((h - 6) / 12) * Math.PI) : 0));
const pSum = prodDay.reduce((a, b) => a + b, 0);
const prod = prodDay.map((v) => (v / pSum) * 30); // 30 kWh/day
const nightLoad = Array.from({ length: 24 }, (_, h) => (h >= 20 || h < 6 ? 30 / 10 : 0));
const dayLoad = Array.from({ length: 24 }, (_, h) => (h >= 9 && h < 19 ? 30 / 10 : 0));
const overlapOf = (l: number[]) => prod.reduce((s, p, h) => s + Math.min(p, l[h]!), 0) / 30;
console.log(`true hourly self-consumption share: night load ${overlapOf(nightLoad).toFixed(3)}, day load ${overlapOf(dayLoad).toFixed(3)}`);
console.log(`model (ratio 1): evening ${modelSelfConsumptionShare(30, 30, "evening").toFixed(3)}, daytime ${modelSelfConsumptionShare(30, 30, "daytime").toFixed(3)}`);

console.log("\n== M. Time-averaging effect on overlap ==");
const coarse = (arr: number[], k: number) => {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i += k) {
    const slice = arr.slice(i, i + k);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    out.push(...slice.map(() => mean));
  }
  return out;
};
const spiky = Array.from({ length: 24 }, (_, h) => (h % 2 === 0 ? 2.5 : 0)); // 30 kWh/day in 1h spikes
console.log(`overlap 1h resolution: ${prod.reduce((s, p, h) => s + Math.min(p, spiky[h]!), 0).toFixed(2)} kWh`);
console.log(`overlap after 6h averaging: ${prod.reduce((s, p, h) => s + Math.min(p, coarse(spiky, 6)[h]!), 0).toFixed(2)} kWh`);
console.log(`overlap after 24h (daily) averaging: ${prod.reduce((s, p, h) => s + Math.min(p, coarse(spiky, 24)[h]!), 0).toFixed(2)} kWh`);

console.log("\n== SUMMARY ==");
console.log(issues.length ? `ISSUES:\n- ${issues.join("\n- ")}` : "No mathematical inconsistencies found in the checked identities.");
console.log(notes.length ? `NOTES:\n- ${notes.join("\n- ")}` : "");
