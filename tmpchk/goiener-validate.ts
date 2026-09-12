/**
 * READ-ONLY comparison against GoiEner (Spain) scenarios.
 *
 * MEASURED hourly household load x MODELLED hourly PVGIS production, scaled to
 * fixed production/consumption ratios. This is NOT measured self-consumption.
 * Imports the production model unchanged; changes nothing.
 *
 * Input: /tmp/goiener/scenarios.csv (built by /tmp/goiener/scenarios.py)
 * Run:   bunx vite-node tmpchk/goiener-validate.ts
 */
import { readFileSync } from "node:fs";

import { modelSelfConsumptionShare, type LoadProfileClass } from "@/lib/calc/self-consumption";

const A = 0.4;
const B = 0.6;
const MAX = 0.85;
const MIN = 0.05;
const PROFILE_FACTOR: Record<LoadProfileClass, number> = { evening: 0.85, mixed: 1, daytime: 1.3 };

function monthlyShare(mProd: number[], mCons: number[], profile: LoadProfileClass): number {
  const f = PROFILE_FACTOR[profile];
  let self = 0;
  let prodTotal = 0;
  for (let m = 0; m < 12; m++) {
    const p = Math.max(0, mProd[m] ?? 0);
    const c = Math.max(0, mCons[m] ?? 0);
    prodTotal += p;
    if (p <= 0 || c <= 0) continue;
    const shareM = Math.min(MAX, Math.max(MIN, A * Math.pow(p / c, -B) * f));
    self += Math.min(shareM * p, p, c);
  }
  return prodTotal > 0 ? self / prodTotal : 0;
}

const lines = readFileSync("/tmp/goiener/scenarios.csv", "utf8").trim().split("\n");
const header = lines[0]!.split(",");
const col = (n: string) => {
  const i = header.indexOf(n);
  if (i < 0) throw new Error(`missing ${n}`);
  return i;
};

interface Row {
  user: string;
  province: string;
  shift: number;
  ratio: number;
  prod: number;
  cons: number;
  refShare: number;
  mProd: number[];
  mCons: number[];
}

const rows: Row[] = lines.slice(1).map((l) => {
  const f = l.split(",");
  const n = (name: string) => Number(f[col(name)]);
  return {
    user: f[col("user")]!,
    province: f[col("province")]!,
    shift: n("shift"),
    ratio: n("ratio_target"),
    prod: n("annual_prod"),
    cons: n("annual_cons"),
    refShare: n("ref_share"),
    mProd: Array.from({ length: 12 }, (_, i) => n(`mp${i + 1}`)),
    mCons: Array.from({ length: 12 }, (_, i) => n(`mc${i + 1}`)),
  };
});

const main = rows.filter((r) => r.shift === 0);

function stats(errs: number[]) {
  const n = errs.length;
  const bias = errs.reduce((s, x) => s + x, 0) / n;
  const mae = errs.reduce((s, x) => s + Math.abs(x), 0) / n;
  const sd = Math.sqrt(errs.reduce((s, x) => s + (x - bias) ** 2, 0) / n);
  const sorted = [...errs].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))]!;
  return { n, bias, mae, sd, p05: q(0.05), p50: q(0.5), p95: q(0.95), max: Math.max(...errs.map(Math.abs)) };
}
const pp = (x: number) => (x * 100).toFixed(1).padStart(6);
const line = (label: string, s: ReturnType<typeof stats>) =>
  `${label.padEnd(22)} n=${String(s.n).padStart(4)}  bias=${pp(s.bias)}pp  MAE=${pp(s.mae)}pp  SD=${pp(s.sd)}pp  p05=${pp(s.p05)}  p50=${pp(s.p50)}  p95=${pp(s.p95)}  |max|=${pp(s.max)}`;

console.log(
  `=== GoiEner scenarios: ${new Set(main.map((r) => r.user)).size} households, ${main.length} household-ratio scenarios ===`,
);
console.log("measured load x modelled PV. Reference = hourly min(PV, load). Constants unchanged.\n");

console.log("--- MAIN CASE: profile = mixed, per ratio ---");
for (const ratio of [0.3, 0.5, 0.8, 1.0, 1.2, 1.6]) {
  const sub = main.filter((r) => r.ratio === ratio);
  const ref = (sub.reduce((s, r) => s + r.refShare, 0) / sub.length) * 100;
  const an = stats(sub.map((r) => modelSelfConsumptionShare(r.prod, r.cons, "mixed") - r.refShare));
  const mo = stats(sub.map((r) => monthlyShare(r.mProd, r.mCons, "mixed") - r.refShare));
  console.log(`\nratio ${ratio.toFixed(1)}  (reference mean ${ref.toFixed(1)}%)`);
  console.log(line("  annual model", an));
  console.log(line("  monthly candidate", mo));
}

console.log("\n--- pooled over all ratios ---");
console.log(line("annual model", stats(main.map((r) => modelSelfConsumptionShare(r.prod, r.cons, "mixed") - r.refShare))));
console.log(line("monthly candidate", stats(main.map((r) => monthlyShare(r.mProd, r.mCons, "mixed") - r.refShare))));

console.log("\n--- SENSITIVITY: same profile applied to every household ---");
for (const p of ["evening", "daytime"] as LoadProfileClass[]) {
  console.log(line(`annual (${p})`, stats(main.map((r) => modelSelfConsumptionShare(r.prod, r.cons, p) - r.refShare))));
  console.log(line(`monthly (${p})`, stats(main.map((r) => monthlyShare(r.mProd, r.mCons, p) - r.refShare))));
}

console.log("\n--- SENSITIVITY: PV/load time alignment (annual model, mixed, pooled) ---");
for (const shift of [0, 1, 2]) {
  const sub = rows.filter((r) => r.shift === shift);
  console.log(line(`shift +${shift} h`, stats(sub.map((r) => modelSelfConsumptionShare(r.prod, r.cons, "mixed") - r.refShare))));
}

console.log("\n--- held-out split for FUTURE calibration (households kept whole, never mixed) ---");
const users = [...new Set(main.map((r) => r.user))].sort();
const calib = new Set(users.filter((_, i) => i % 2 === 0));
for (const [name, pred] of [
  ["calibration half", (r: Row) => calib.has(r.user)],
  ["validation half", (r: Row) => !calib.has(r.user)],
] as Array<[string, (r: Row) => boolean]>) {
  const sub = main.filter(pred);
  console.log(
    `${name.padEnd(18)} households=${new Set(sub.map((r) => r.user)).size}  ` +
      line("annual", stats(sub.map((r) => modelSelfConsumptionShare(r.prod, r.cons, "mixed") - r.refShare))),
  );
}

console.log(`\n85 % cap binds: ${main.filter((r) => modelSelfConsumptionShare(r.prod, r.cons, "mixed") >= MAX - 1e-9).length}/${main.length} scenarios`);
console.log(
  "\nNOTE: hourly min(PV, load) is a time-resolved ESTIMATE and an upper bound on true\ninstantaneous self-consumption. PV is modelled, not measured, so this validates the\nmodel against measured LOAD TIMING only, under one fixed roof assumption.",
);
