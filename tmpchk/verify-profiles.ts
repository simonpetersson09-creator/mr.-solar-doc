/* Read-only verification sweep for the load-profile feature. Not shipped. */
import { calculateSolarSystem, runCalculation } from "@/lib/calc/engine";
import { MARKETS } from "@/config/markets";
import type { CalculationInput } from "@/lib/calc/types";
import type { LoadProfileClass } from "@/lib/calc/self-consumption";

const M = [22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5];

function makeInput(o: Partial<CalculationInput> = {}): CalculationInput {
  const market = MARKETS["SE"]!;
  return {
    location: { address: "Testgatan 1", latitude: 59.33, longitude: 18.07, countryCode: "SE", region: "Stockholm" },
    resource: {
      annualKwhPerKwp: M.reduce((a, b) => a + b, 0),
      monthlyKwhPerKwp: M,
      orientation: "south",
      tiltDegrees: 30,
      orientationAssumed: false,
      tiltAssumed: false,
      dataSource: "test",
      calculationDate: "2026-01-01",
    },
    consumption: { annualKwh: 8000, monthlyKwh: null },
    electrical: { mainFuseAmp: 25, kwPerAmp: market.kwPerAmp },
    economics: { selfConsumedValuePerKwh: 1.5, exportValuePerKwh: 0.6, currency: "SEK" },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: market.inverterSizesKw,
    ...o,
  };
}

const profiles: (LoadProfileClass | undefined)[] = [undefined, "evening", "mixed", "daytime"];
const problems: string[] = [];
const rows: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (!ok) problems.push(`FAIL ${name} ${detail}`);
}

// ratio scenarios: fuse sizes/consumptions giving low, ~equal, high production vs consumption
const scenarios: { label: string; input: Partial<CalculationInput> }[] = [
  { label: "hög förbrukn (20 000, 25A)", input: { consumption: { annualKwh: 20000, monthlyKwh: null } } },
  { label: "balans (11 000, 25A)", input: { consumption: { annualKwh: 11000, monthlyKwh: null } } },
  { label: "låg förbrukn (4 000, 25A)", input: { consumption: { annualKwh: 4000, monthlyKwh: null } } },
  {
    label: "månadsdata (12 000)",
    input: {
      consumption: {
        annualKwh: 12000,
        monthlyKwh: [1500, 1400, 1200, 900, 700, 600, 550, 600, 800, 1050, 1300, 1400],
      },
    },
  },
];

for (const s of scenarios) {
  const base: Record<string, number> = {};
  for (const p of profiles) {
    const r = calculateSolarSystem(makeInput({ ...s.input, loadProfileClass: p }));
    const key = p ?? "saknad";
    const prod = r.annualProductionKwh;
    const self = r.selfConsumedKwh;
    const exp = r.exportedKwh;
    const cons = r.consumption.annualKwh;
    const imp = cons - self;
    const save = r.economics.totalValue;
    base[key] = self;
    base[key + ":prod"] = prod;

    // energy balance
    check(`${s.label}/${key} balans`, Math.abs(self + exp - prod) < 1e-6, `${self}+${exp}!=${prod}`);
    check(`${s.label}/${key} self<=prod`, self <= prod + 1e-9);
    check(`${s.label}/${key} self<=cons`, self <= cons + 1e-9);
    check(`${s.label}/${key} import>=0`, imp >= -1e-9);
    check(`${s.label}/${key} andel 0..1`, r.selfConsumptionRate >= 0 && r.selfConsumptionRate <= 1 && r.selfSufficiencyRate >= 0 && r.selfSufficiencyRate <= 1);
    for (const [k, v] of Object.entries({ prod, self, exp, save, rate: r.selfConsumptionRate, maxInv: r.investment.maxInvestment, lcoe: r.productionCost.productionCostPerKwh ?? 0 })) {
      check(`${s.label}/${key} finite ${k}`, Number.isFinite(v as number), String(v));
      check(`${s.label}/${key} nonneg ${k}`, (v as number) >= 0, String(v));
    }
    // economics uses right quantities, no double profile adjustment
    const expectedSelfVal = self * r.economics.selfConsumedValuePerKwh;
    const expectedExpVal = exp * r.economics.exportValuePerKwh;
    check(`${s.label}/${key} ekonomi self`, Math.abs(r.economics.selfConsumptionValue - expectedSelfVal) < 1e-6);
    check(`${s.label}/${key} ekonomi export`, Math.abs(r.economics.exportValue - expectedExpVal) < 1e-6);

    rows.push(
      [
        s.label,
        key,
        r.installedKwp.toFixed(2) + " kWp",
        Math.round(prod),
        (r.selfConsumptionRate * 100).toFixed(1) + " %",
        Math.round(self),
        Math.round(imp),
        Math.round(exp),
        Math.round(save),
        r.selfConsumptionSource,
      ].join(" | "),
    );
  }
  check(`${s.label} saknad==mixed`, Math.abs(base["saknad"]! - base["mixed"]!) < 1e-9);
  check(`${s.label} produktion oberoende av profil`, new Set(profiles.map((p) => base[(p ?? "saknad") + ":prod"])).size === 1);
  const order = base["evening"]! <= base["mixed"]! && base["mixed"]! <= base["daytime"]!;
  check(`${s.label} ordning kväll<=blandat<=dagtid`, order, `${base["evening"]}/${base["mixed"]}/${base["daytime"]}`);
  rows.push("---");
}

// manual override across profiles
for (const p of profiles) {
  const r = calculateSolarSystem(
    makeInput({
      consumption: { annualKwh: 20000, monthlyKwh: null },
      loadProfileClass: p,
      selfConsumptionShare: 0.55,
      selfConsumptionShareIsUserSet: true,
    }),
  );
  check(`manuell/${p ?? "saknad"} source`, r.selfConsumptionSource === "user-override", r.selfConsumptionSource);
  check(`manuell/${p ?? "saknad"} andel`, Math.abs(r.selfConsumptionRate - 0.55) < 1e-9, String(r.selfConsumptionRate));
  rows.push(`manuell 55 % | ${p ?? "saknad"} | ${(r.selfConsumptionRate * 100).toFixed(1)} % | ${Math.round(r.selfConsumedKwh)} kWh | ${Math.round(r.economics.totalValue)}`);
}

// edge cases
const edges: { label: string; input: Partial<CalculationInput> }[] = [
  { label: "0 förbrukning", input: { consumption: { annualKwh: 0, monthlyKwh: null } } },
  { label: "negativ förbrukning", input: { consumption: { annualKwh: -5, monthlyKwh: null } } },
  { label: "extremt hög förbrukning", input: { consumption: { annualKwh: 500000, monthlyKwh: null } } },
  { label: "nollpris", input: { economics: { selfConsumedValuePerKwh: 0, exportValuePerKwh: 0, currency: "SEK" } } },
  { label: "okända priser", input: { economics: { selfConsumedValuePerKwh: null, exportValuePerKwh: null, currency: "SEK" } } },
  { label: "liten säkring 10A", input: { electrical: { mainFuseAmp: 10, kwPerAmp: MARKETS["SE"]!.kwPerAmp } } },
  { label: "stor säkring 200A", input: { electrical: { mainFuseAmp: 200, kwPerAmp: MARKETS["SE"]!.kwPerAmp } } },
  { label: "NaN förbrukning", input: { consumption: { annualKwh: Number.NaN, monthlyKwh: null } } },
];
for (const e of edges) {
  for (const p of ["evening", "daytime"] as LoadProfileClass[]) {
    const out = runCalculation(makeInput({ ...e.input, loadProfileClass: p }));
    if (out.status !== "success") {
      rows.push(`EDGE ${e.label} | ${p} | ${out.status}`);
      continue;
    }
    const r = out.result;
    const nums = [r.annualProductionKwh, r.selfConsumedKwh, r.exportedKwh, r.economics.totalValue, r.investment.maxInvestment];
    check(`edge ${e.label}/${p} finita`, nums.every((n) => Number.isFinite(n)), JSON.stringify(nums));
    check(`edge ${e.label}/${p} icke-negativa`, nums.every((n) => n >= 0), JSON.stringify(nums));
    check(`edge ${e.label}/${p} balans`, Math.abs(r.selfConsumedKwh + r.exportedKwh - r.annualProductionKwh) < 1e-6);
    check(`edge ${e.label}/${p} andel<=1`, r.selfConsumptionRate <= 1 && r.selfSufficiencyRate <= 1);
    rows.push(
      `EDGE ${e.label} | ${p} | ${r.installedKwp.toFixed(2)} kWp | prod ${Math.round(r.annualProductionKwh)} | ${(r.selfConsumptionRate * 100).toFixed(1)} % | self ${Math.round(r.selfConsumedKwh)} | exp ${Math.round(r.exportedKwh)} | spar ${Math.round(r.economics.totalValue)}`,
    );
  }
}

console.log(rows.join("\n"));
console.log("\nPROBLEM:", problems.length);
for (const p of problems) console.log(p);
