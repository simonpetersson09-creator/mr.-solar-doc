/**
 * Read-only pre-release review script. Creates no production changes.
 * Run: bunx vite-node tmpchk/final-review.ts
 */
import { calculateSolarSystem } from "@/lib/calc/engine";
import type { CalculationInput } from "@/lib/calc/types";
import { modelSelfConsumptionShare } from "@/lib/calc/self-consumption";

const YIELD = [20, 38, 78, 110, 135, 140, 135, 110, 75, 40, 18, 12]; // kWh/kWp, Stockholm-ish
const ANNUAL_YIELD = YIELD.reduce((a, b) => a + b, 0);

function input(over: Partial<CalculationInput> & { annualKwh?: number } = {}): CalculationInput {
  const annualKwh = over.annualKwh ?? 20000;
  return {
    location: { countryCode: "SE", latitude: 59.33, longitude: 18.06, label: "Stockholm" },
    resource: {
      annualKwhPerKwp: ANNUAL_YIELD,
      monthlyKwhPerKwp: YIELD,
      dataSource: "test",
      orientationAssumed: false,
      tiltAssumed: false,
    },
    consumption: { annualKwh, monthlyKwh: null, inputType: "annual", shape: "default", isEstimated: false },
    electrical: { mainFuseAmp: 25, maxAcPowerKw: 17.3, gridVoltageV: 400, gridPhases: 3, serviceType: "three-phase" },
    economics: {
      selfConsumedValuePerKwh: 1.44,
      exportValuePerKwh: 0.6,
      installationCostPerKwp: null,
      gridCompensationPerKwh: null,
      gridCompensationEnabled: true,
      currency: "SEK",
      valuesMissing: false,
      selfConsumedValueSource: "standard-value",
      exportValueSource: "standard-value",
    },
    selfConsumptionShare: 0.4,
    selfConsumptionShareIsUserSet: false,
    acceptedPaybackYears: 12,
    annualPriceChangeRate: 0.02,
    quotePrice: null,
    ...(over as object),
  } as CalculationInput;
}

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

console.log("=== A. Matris: energibalans + ekonomi ===");
console.log("fall | kWp | prod | share% | self | export | import | spar SEK | maxInv | kr/kWh");
const cases: Array<[string, Partial<CalculationInput> & { annualKwh?: number }]> = [
  ["stor 20000", { annualKwh: 20000 }],
  ["normal 11000", { annualKwh: 11000 }],
  ["liten 4000", { annualKwh: 4000 }],
  ["mkt liten 1000", { annualKwh: 1000 }],
  ["10A säkring", { annualKwh: 20000, electrical: { mainFuseAmp: 10, maxAcPowerKw: 6.9, gridVoltageV: 400, gridPhases: 3, serviceType: "three-phase" } as never }],
  ["profil kväll", { annualKwh: 11000, loadProfileClass: "evening" } as never],
  ["profil dagtid", { annualKwh: 11000, loadProfileClass: "daytime" } as never],
  ["manuell 70%", { annualKwh: 11000, selfConsumptionShare: 0.7, selfConsumptionShareIsUserSet: true }],
  ["nollpris", { annualKwh: 11000, economics: { ...input().economics, selfConsumedValuePerKwh: 0, exportValuePerKwh: 0 } as never }],
  ["saknat pris", { annualKwh: 11000, economics: { ...input().economics, selfConsumedValuePerKwh: null, exportValuePerKwh: null, valuesMissing: true } as never }],
];

for (const [name, over] of cases) {
  const r = calculateSolarSystem(input(over));
  const p = r.presentation;
  const imp = r.consumption.annualKwh - r.selfConsumption.kwh;
  console.log(
    `${name.padEnd(15)} | ${r.installedKwp.toFixed(2)} | ${Math.round(r.annualProductionKwh)} | ${(r.selfConsumption.share * 100).toFixed(1)} | ${Math.round(r.selfConsumption.kwh)} | ${Math.round(r.exported.kwh)} | ${Math.round(imp)} | ${p.annualSavings} | ${r.investment.maxInvestmentRounded} | ${r.productionCost.costPerKwh?.toFixed(3) ?? "-"}`,
  );
  // energibalans
  check(near(r.selfConsumption.kwh + r.exported.kwh, r.annualProductionKwh), `${name}: self+export != produktion`);
  check(r.selfConsumption.kwh <= r.annualProductionKwh + 1e-9, `${name}: self > produktion`);
  check(r.selfConsumption.kwh <= r.consumption.annualKwh + 1e-9, `${name}: self > förbrukning`);
  check(imp >= -1e-9, `${name}: negativ import`);
  check(r.exported.kwh >= -1e-9, `${name}: negativ export`);
  check(p.selfConsumptionKwh + p.exportedKwh === p.annualProductionKwh, `${name}: presentation summerar ej`);
  check(p.selfConsumptionValue + p.exportValue === p.annualSavings, `${name}: pengar summerar ej`);
  check(Number.isFinite(r.investment.maxInvestment) && r.investment.maxInvestment >= 0, `${name}: maxInvestment ogiltig`);
  check(r.dcAcRatio <= 1.3 + 1e-9, `${name}: DC/AC över 1,30`);
  // ekonomi = mängd × pris exakt (ingen dubbel profiljustering)
  check(
    near(r.economics.selfConsumptionValue, r.selfConsumption.kwh * r.economics.selfConsumedValuePerKwh),
    `${name}: egenanvänt värde != kWh × pris`,
  );
  check(near(r.economics.exportValue, r.exported.kwh * r.economics.exportValuePerKwh), `${name}: exportvärde != kWh × pris`);
}

console.log("\n=== B. Oberoende handberäkningar ===");
const base = calculateSolarSystem(input({ annualKwh: 11000 }));
// 1. produktion
const handProd = base.installedKwp * ANNUAL_YIELD;
console.log(`produktion: motor ${base.annualProductionKwh.toFixed(1)} | hand ${handProd.toFixed(1)}`);
check(near(base.annualProductionKwh, handProd, 1e-9), "produktion != kWp × specifikt utbyte");
// 2. andel
const ratio = base.annualProductionKwh / 11000;
const handShare = 0.4 * Math.pow(ratio, -0.6);
console.log(`andel: motor ${(base.selfConsumption.share * 100).toFixed(2)} % | hand ${(handShare * 100).toFixed(2)} %`);
check(near(base.selfConsumption.share, handShare, 1e-6), "andel != 0,40·ratio^-0,60");
check(near(modelSelfConsumptionShare(base.annualProductionKwh, 11000), handShare, 1e-9), "modellfunktion avviker");
// 3. degraderad livstidsproduktion (geometrisk summa, 30 år, 0,5 %/år)
const r0 = 0.995;
const handTotal = base.annualProductionKwh * (1 - Math.pow(r0, 30)) / (1 - r0);
console.log(`livstidsprod: motor ${base.lifetime.totalProductionKwh.toFixed(0)} | hand ${handTotal.toFixed(0)}`);
check(near(base.lifetime.totalProductionKwh, handTotal, 1e-9), "livstidsproduktion != geometrisk summa");
// 4. maxinvestering = summa av 12 första årens värden
const sum12 = base.lifetime.years.slice(0, 12).reduce((s, y) => s + y.economicValue, 0);
console.log(`maxinvestering: motor ${base.investment.maxInvestment.toFixed(0)} | hand(Σ12 år) ${sum12.toFixed(0)}`);
check(near(base.investment.maxInvestment, sum12, 1e-9), "maxinvestering != Σ värde 12 år");
// 5. kr/kWh
const handCost = base.investment.maxInvestment / base.lifetime.totalProductionKwh;
console.log(`kr/kWh: motor ${base.productionCost.costPerKwh?.toFixed(4)} | hand ${handCost.toFixed(4)}`);
check(near(base.productionCost.costPerKwh ?? 0, handCost, 1e-9), "kr/kWh != maxinvestering / livstidsproduktion");
// 6. prisfaktor år 12
const y12 = base.lifetime.years[11]!;
check(near(y12.priceFactor, Math.pow(1.02, 11), 1e-12), "prisfaktor fel");
console.log(`prisfaktor år 12: ${y12.priceFactor.toFixed(4)} (hand ${Math.pow(1.02, 11).toFixed(4)})`);

console.log("\n=== C. Manuell andel: fysiska gränser + eftersläpning ===");
const manual = calculateSolarSystem(input({ annualKwh: 3000, selfConsumptionShare: 1, selfConsumptionShareIsUserSet: true }));
console.log(`manuell 100 % vid 3000 kWh: effektiv ${(manual.selfConsumption.share * 100).toFixed(1)} %, self ${manual.selfConsumption.kwh.toFixed(0)} kWh, cap=${manual.presentation.selfConsumptionCapped}`);
check(manual.selfConsumption.kwh <= 3000 + 1e-9, "manuell andel bryter fysisk gräns");
for (const cls of ["evening", "mixed", "daytime"] as const) {
  const r = calculateSolarSystem(input({ annualKwh: 11000, selfConsumptionShare: 0.7, selfConsumptionShareIsUserSet: true, loadProfileClass: cls } as never));
  check(near(r.selfConsumption.share, 0.7, 1e-9), `manuell andel ändrades av profil ${cls}`);
}
// eftersläpning: manuellt satt vid liten anläggning, sedan mycket större förbrukning
const stale = calculateSolarSystem(input({ annualKwh: 40000, selfConsumptionShare: 0.2, selfConsumptionShareIsUserSet: true }));
console.log(`gammalt manuellt 20 % vid ändrad förbrukning 40000: andel ${(stale.selfConsumption.share * 100).toFixed(0)} % (modellen hade gett ${(modelSelfConsumptionShare(stale.annualProductionKwh, 40000) * 100).toFixed(0)} %), källa ${stale.selfConsumptionSource}`);

console.log("\n=== D. Profilordning ===");
for (const annual of [4000, 11000, 20000]) {
  const s = (cls: "evening" | "mixed" | "daytime") =>
    calculateSolarSystem(input({ annualKwh: annual, loadProfileClass: cls } as never)).selfConsumption.share;
  const [e, m, d] = [s("evening"), s("mixed"), s("daytime")];
  const none = calculateSolarSystem(input({ annualKwh: annual })).selfConsumption.share;
  console.log(`${annual}: kväll ${(e * 100).toFixed(1)} | blandat ${(m * 100).toFixed(1)} | dagtid ${(d * 100).toFixed(1)} | ingen ${(none * 100).toFixed(1)}`);
  check(near(none, m, 1e-12), `${annual}: saknad profil != mixed`);
  check(e <= m + 1e-12 && m <= d + 1e-12, `${annual}: profilordning bruten (kan vara clamp)`);
}

console.log("\n=== E. Gränsfall ===");
for (const [name, over] of [
  ["förbrukning 0", { annualKwh: 0 }],
  ["förbrukning negativ", { annualKwh: -5 }],
  ["förbrukning NaN", { annualKwh: Number.NaN }],
  ["extrem förbrukning", { annualKwh: 5_000_000 }],
  ["negativt pris", { annualKwh: 11000, economics: { ...input().economics, exportValuePerKwh: -1 } as never }],
  ["payback 0", { annualKwh: 11000, acceptedPaybackYears: 0 }],
] as Array<[string, Partial<CalculationInput> & { annualKwh?: number }]>) {
  try {
    const r = calculateSolarSystem(input(over));
    const vals = [r.annualProductionKwh, r.selfConsumption.kwh, r.exported.kwh, r.investment.maxInvestment, r.presentation.annualSavings];
    const bad = vals.some((v) => !Number.isFinite(v) || v < 0);
    console.log(`${name.padEnd(22)} -> OK, andel ${(r.selfConsumption.share * 100).toFixed(0)} %, spar ${r.presentation.annualSavings}, kr/kWh ${r.productionCost.costPerKwh?.toFixed(3) ?? "-"}${bad ? "  <-- OGILTIGT VÄRDE" : ""}`);
    check(!bad, `${name}: NaN/negativt värde släpps ut`);
  } catch (e) {
    console.log(`${name.padEnd(22)} -> valideringsfel: ${(e as Error).name}`);
  }
}

console.log("\n=== F. Profil/pris påverkar inte produktionen ===");
const prods = new Set(
  (["evening", "mixed", "daytime"] as const).map((cls) =>
    calculateSolarSystem(input({ annualKwh: 11000, loadProfileClass: cls } as never)).annualProductionKwh.toFixed(6),
  ),
);
check(prods.size === 1, "profilval ändrar produktionen");
console.log(`produktion identisk över profiler: ${prods.size === 1}`);

console.log(`\n=== RESULTAT: ${problems.length === 0 ? "inga avvikelser" : problems.length + " avvikelser"} ===`);
for (const p of problems) console.log("PROBLEM: " + p);

console.log("\n=== G. Priskänslighet SE (export 0,60 vs 0,40 vs 0,35) ===");
for (const ex of [0.6, 0.4, 0.35]) {
  const r = calculateSolarSystem(input({ annualKwh: 11000, economics: { ...input().economics, exportValuePerKwh: ex } as never }));
  console.log(`export ${ex}: spar ${r.presentation.annualSavings} SEK/år, maxinvestering ${r.investment.maxInvestmentRounded}`);
}
for (const imp of [1.44, 1.8, 2.0]) {
  const r = calculateSolarSystem(input({ annualKwh: 11000, economics: { ...input().economics, selfConsumedValuePerKwh: imp } as never }));
  console.log(`import ${imp}: spar ${r.presentation.annualSavings} SEK/år, maxinvestering ${r.investment.maxInvestmentRounded}`);
}
