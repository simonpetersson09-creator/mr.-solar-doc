/**
 * READ-ONLY VALIDATION against the Ausgrid Solar Home dataset.
 *
 * Imports the production self-consumption model unchanged and compares it, plus
 * the monthly candidate with unchanged constants, against a half-hour-resolved
 * self-consumption reference computed from gross-metered measurements.
 *
 * Input: /tmp/ausgrid/household_years.csv produced by /tmp/ausgrid/aggregate.py
 * Run:   bunx vite-node tmpchk/ausgrid-validate.ts
 * Changes nothing.
 */
import { readFileSync } from "node:fs";

import { modelSelfConsumptionShare, type LoadProfileClass } from "@/lib/calc/self-consumption";

const A = 0.4;
const B = 0.6;
const MAX = 0.85;
const MIN = 0.05;
const PROFILE_FACTOR: Record<LoadProfileClass, number> = {
  evening: 0.85,
  mixed: 1,
  daytime: 1.3,
};

/** Monthly candidate, constants unchanged. Power law on monthly production, physical cap last. */
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

/* ---------------------------------------------------------------- parse CSV */
const raw = readFileSync("/tmp/ausgrid/household_years.csv", "utf8").trim().split("\n");
const header = raw[0]!.split(",");
const idx = (name: string) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`missing column ${name}`);
  return i;
};

interface Row {
  year: string;
  customer: number;
  kwp: number;
  hasCl: boolean;
  annualProd: number;
  annualCons: number;
  measuredShare: number;
  measuredShareGcOnly: number;
  ratio: number;
  mProd: number[];
  mCons: number[];
}

const rows: Row[] = raw.slice(1).map((line) => {
  const f = line.split(",");
  const num = (n: string) => Number(f[idx(n)]);
  return {
    year: f[idx("year")]!,
    customer: num("customer"),
    kwp: num("kwp"),
    hasCl: f[idx("has_cl")] === "True",
    annualProd: num("annual_prod"),
    annualCons: num("annual_cons"),
    measuredShare: num("measured_share"),
    measuredShareGcOnly: num("measured_share_gc_only"),
    ratio: num("ratio"),
    mProd: Array.from({ length: 12 }, (_, i) => num(`mp${i + 1}`)),
    mCons: Array.from({ length: 12 }, (_, i) => num(`mc${i + 1}`)),
  };
});

/* ------------------------------------------------------------------- stats */
function stats(errs: number[]) {
  const n = errs.length;
  const bias = errs.reduce((s, x) => s + x, 0) / n;
  const mae = errs.reduce((s, x) => s + Math.abs(x), 0) / n;
  const sorted = [...errs].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))]!;
  const sd = Math.sqrt(errs.reduce((s, x) => s + (x - bias) ** 2, 0) / n);
  const over = errs.filter((e) => e > 0.1).length;
  const under = errs.filter((e) => e < -0.1).length;
  return { n, bias, mae, sd, p05: q(0.05), p50: q(0.5), p95: q(0.95), max: Math.max(...errs.map(Math.abs)), over, under };
}

const pp = (x: number) => (x * 100).toFixed(1).padStart(6);

function line(label: string, s: ReturnType<typeof stats>): string {
  return `${label.padEnd(30)} n=${String(s.n).padStart(4)}  bias=${pp(s.bias)}pp  MAE=${pp(s.mae)}pp  SD=${pp(s.sd)}pp  p05=${pp(s.p05)}  p50=${pp(s.p50)}  p95=${pp(s.p95)}  |max|=${pp(s.max)}  >+10pp:${String(s.over).padStart(4)}  <-10pp:${String(s.under).padStart(4)}`;
}

console.log(`=== Ausgrid validation: ${rows.length} complete customer-years ===`);
console.log(
  `measured half-hour reference share: mean ${(
    (rows.reduce((s, r) => s + r.measuredShare, 0) / rows.length) * 100
  ).toFixed(1)}%`,
);

/* MAIN CASE: profile = mixed (household behaviour is not documented). */
console.log("\n--- MAIN CASE: profile = mixed, constants unchanged ---");
const errAnnual = rows.map((r) => modelSelfConsumptionShare(r.annualProd, r.annualCons, "mixed") - r.measuredShare);
const errMonthly = rows.map((r) => monthlyShare(r.mProd, r.mCons, "mixed") - r.measuredShare);
console.log(line("annual model", stats(errAnnual)));
console.log(line("monthly candidate", stats(errMonthly)));

/* SENSITIVITY: the other two profiles, applied to ALL households (never picked per household). */
console.log("\n--- SENSITIVITY: same profile applied to every household ---");
for (const p of ["evening", "daytime"] as LoadProfileClass[]) {
  console.log(
    line(
      `annual (${p})`,
      stats(rows.map((r) => modelSelfConsumptionShare(r.annualProd, r.annualCons, p) - r.measuredShare)),
    ),
  );
  console.log(line(`monthly (${p})`, stats(rows.map((r) => monthlyShare(r.mProd, r.mCons, p) - r.measuredShare))));
}

/* BY RATIO BUCKET */
console.log("\n--- by production/consumption ratio (profile = mixed) ---");
const buckets: Array<[string, (r: Row) => boolean]> = [
  ["ratio < 0.20", (r) => r.ratio < 0.2],
  ["0.20 - 0.35", (r) => r.ratio >= 0.2 && r.ratio < 0.35],
  ["0.35 - 0.50", (r) => r.ratio >= 0.35 && r.ratio < 0.5],
  ["0.50 - 0.80", (r) => r.ratio >= 0.5 && r.ratio < 0.8],
  ["ratio >= 0.80", (r) => r.ratio >= 0.8],
];
for (const [label, pred] of buckets) {
  const sub = rows.filter(pred);
  if (!sub.length) continue;
  const measured = (sub.reduce((s, r) => s + r.measuredShare, 0) / sub.length) * 100;
  console.log(`\n${label}  (measured mean ${measured.toFixed(1)}%)`);
  console.log(
    line("  annual", stats(sub.map((r) => modelSelfConsumptionShare(r.annualProd, r.annualCons, "mixed") - r.measuredShare))),
  );
  console.log(line("  monthly", stats(sub.map((r) => monthlyShare(r.mProd, r.mCons, "mixed") - r.measuredShare))));
}

/* CLAMPING: how often does the 85 % cap bind? */
const clampedAnnual = rows.filter((r) => modelSelfConsumptionShare(r.annualProd, r.annualCons, "mixed") >= MAX - 1e-9).length;
console.log(`\n85 % cap binds: annual model ${clampedAnnual}/${rows.length} customer-years`);

/* CL SENSITIVITY: does including controlled load change the picture? */
const withCl = rows.filter((r) => r.hasCl);
console.log(
  `\n--- controlled-load sensitivity (${withCl.length} customer-years with a CL channel) ---`,
);
console.log(
  line(
    "annual vs GC+CL reference",
    stats(withCl.map((r) => modelSelfConsumptionShare(r.annualProd, r.annualCons, "mixed") - r.measuredShare)),
  ),
);
console.log(
  line(
    "annual vs GC-only reference",
    stats(withCl.map((r) => modelSelfConsumptionShare(r.annualProd, r.annualCons, "mixed") - r.measuredShareGcOnly)),
  ),
);

/* WORST CASES */
console.log("\n--- 8 worst annual-model cases (profile = mixed) ---");
const worst = rows
  .map((r) => ({ r, e: modelSelfConsumptionShare(r.annualProd, r.annualCons, "mixed") - r.measuredShare }))
  .sort((a, b) => Math.abs(b.e) - Math.abs(a.e))
  .slice(0, 8);
for (const { r, e } of worst) {
  console.log(
    `cust ${String(r.customer).padStart(3)} ${r.year}  kWp=${r.kwp.toFixed(2).padStart(5)}  ratio=${r.ratio.toFixed(2)}  measured=${(r.measuredShare * 100).toFixed(1)}%  model=${((r.measuredShare + e) * 100).toFixed(1)}%  err=${pp(e)}pp`,
  );
}
console.log(
  "\nNOTE: the reference is sum over half hours of min(PV, load). Half-hour energy totals\nhide sub-interval mismatch, so this is a time-resolved ESTIMATE and an UPPER BOUND on\ntrue instantaneous self-consumption, not a measured self-consumption value.",
);
