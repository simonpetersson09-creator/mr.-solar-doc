/* Read-only: stora växelriktare 60-200 kW. Ändrar inget i appen. */
import { selectRecommendedSystem, evaluateSystemCandidate } from "@/lib/calc/candidate-selection";
import { monthlyProduction, annualProduction } from "@/lib/calc/energy-production";
import { splitProduction, monthlyOverlapCapKwh } from "@/lib/calc/self-consumption";

const panelKwp = 0.43;
function monthly(a:number){const w=[1.25,1.15,1.05,0.9,0.8,0.7,0.7,0.75,0.9,1.05,1.15,1.25];const s=w.reduce((x,y)=>x+y,0);return w.map(x=>a*x/s);}

// Svenskt stortak / lantbruk: trefas 400 V, hög förbrukning
const RES = 1000; // kWh/kWp
const mpk = monthly(RES);
const CONS = 400000;
const mcons = monthly(CONS);

console.log("== A) Dagens urvalsfunktion matad med stora växelriktaralternativ ==");
const bigOptions = [60,80,100,125,150,200].map(kw=>({unitKw:kw,unitCount:1,totalAcKw:kw}));
const targetKwp = CONS/RES; // energiparitet
const sel = selectRecommendedSystem({
  targetKwp, referenceKwp: targetKwp, maxAcPowerKw: 250,
  inverterOptions: bigOptions, panelPowerKwp: panelKwp,
  targetRange: {min:1.05,max:1.3}, monthlyKwhPerKwp: mpk,
  annualConsumptionKwh: CONS, monthlyConsumptionKwh: mcons,
  solarSeasonProductionShare: 0.7,
});
if (sel.status==="ok") {
  const b=sel.best;
  console.log(`vinnare: inv=${b.inverterKw} kW (${b.unitCount}x${b.unitKw}) kWp=${b.installedKwp.toFixed(1)} dcac=${b.dcAcRatio.toFixed(3)} score=${b.score.toFixed(3)} inWindow=${sel.withinTargetRange} miss=${sel.targetRangeMiss}`);
} else console.log("grid-too-small", sel);

console.log("\n== B) Fri energisimulering: fast array, växelriktare 60-200 kW ==");
console.log("inv_kW  kWp     dcac   prod_kWh   self_kWh  self%   export_kWh");
for (const inv of [60,80,100,125,150,200]) {
  for (const dcac of [1.1,1.3]) {
    const kwp = Math.floor(inv*dcac/panelKwp)*panelKwp;
    const mprod = monthlyProduction(mpk, kwp);
    const prod = annualProduction(mprod);
    const cap = monthlyOverlapCapKwh(mprod, mcons);
    const split = splitProduction(prod, 0.4, CONS, cap);
    console.log(`${String(inv).padEnd(7)} ${kwp.toFixed(1).padEnd(7)} ${(kwp/inv).toFixed(2)}   ${prod.toFixed(0).padStart(9)}  ${split.selfConsumptionKwh.toFixed(0).padStart(9)}  ${(split.selfConsumptionShare*100).toFixed(1)}  ${split.exportedKwh.toFixed(0).padStart(10)}  bind=${split.capBinding}`);
  }
}

console.log("\n== C) Energiparitet: array dimensionerad mot 400 MWh/år ==");
for (const inv of [125,150,200]) {
  const kwp = Math.round(CONS/RES/panelKwp)*panelKwp;
  const mprod = monthlyProduction(mpk, kwp);
  const prod = annualProduction(mprod);
  const cap = monthlyOverlapCapKwh(mprod, mcons);
  const split = splitProduction(prod, 0.4, CONS, cap);
  console.log(`inv=${inv} kW  kWp=${kwp.toFixed(1)}  dcac=${(kwp/inv).toFixed(2)}  prod=${prod.toFixed(0)}  self=${split.selfConsumptionKwh.toFixed(0)} (${(split.selfConsumptionShare*100).toFixed(1)}%)  export=${split.exportedKwh.toFixed(0)}  bind=${split.capBinding}`);
}
