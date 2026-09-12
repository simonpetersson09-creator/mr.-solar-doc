/**
 * CONTROLLED TEST — isolates the hourly distribution.
 *
 * Monthly production sums, monthly consumption sums, annual totals and the
 * chosen load-profile factor are held IDENTICAL. The ONLY thing that varies is
 * how the same monthly consumption energy is spread across the 24 hours of the
 * day. Purpose: resolve whether night EV charging can change the annual model
 * or the monthly candidate at all (it cannot, by construction), and how much it
 * moves the hourly reference.
 *
 * Read-only: imports production code, changes nothing.
 * Run: bunx vite-node tmpchk/night-charging-check.ts
 */
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
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/* ---------- monthly candidate (identical formula to compare script) ------- */
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

/* ---------- hourly reference (synthetic shapes, unvalidated) -------------- */
function hourlyProductionForMonth(monthEnergy: number, days: number, daylightH: number): number[] {
  const half = daylightH / 2;
  const dayShape: number[] = [];
  for (let h = 0; h < 24; h++) {
    const x = h + 0.5 - 12;
    dayShape.push(Math.abs(x) >= half ? 0 : Math.cos((Math.PI * x) / (2 * half)) ** 2);
  }
  const dayTotal = dayShape.reduce((a, b) => a + b, 0) || 1;
  const perDay = monthEnergy / days;
  const out: number[] = [];
  for (let d = 0; d < days; d++)
    for (let h = 0; h < 24; h++) out.push((perDay * (dayShape[h] ?? 0)) / dayTotal);
  return out;
}

function hourlyConsumptionForMonth(monthEnergy: number, days: number, shape: number[]): number[] {
  const total = shape.reduce((a, b) => a + b, 0) || 1;
  const perDay = monthEnergy / days;
  const out: number[] = [];
  for (let d = 0; d < days; d++)
    for (let h = 0; h < 24; h++) out.push((perDay * (shape[h] ?? 0)) / total);
  return out;
}

function hourlyShare(
  mProd: number[],
  mCons: number[],
  diurnal: number[],
  latitude: number,
): number {
  let self = 0;
  let prodTotal = 0;
  for (let m = 0; m < 12; m++) {
    const days = DAYS[m] ?? 30;
    const decl = 23.45 * Math.sin((2 * Math.PI * (284 + (m * 30.4 + 15))) / 365);
    const rad = Math.PI / 180;
    const cosH = -Math.tan(latitude * rad) * Math.tan(decl * rad);
    const daylightH = cosH <= -1 ? 24 : cosH >= 1 ? 0.1 : (2 * Math.acos(cosH)) / rad / 15;
    const p = hourlyProductionForMonth(
      Math.max(0, mProd[m] ?? 0),
      days,
      Math.max(2, daylightH),
    );
    const c = hourlyConsumptionForMonth(Math.max(0, mCons[m] ?? 0), days, diurnal);
    for (let i = 0; i < p.length; i++) {
      const pi = p[i] ?? 0;
      self += Math.min(pi, c[i] ?? 0);
      prodTotal += pi;
    }
  }
  return prodTotal > 0 ? self / prodTotal : 0;
}

/* ---------- the only thing that varies: 24 h consumption shapes ----------- */
const SHAPES: Record<string, number[]> = {
  "flat (reference)": Array(24).fill(1),
  "evening peak": [
    0.5, 0.45, 0.4, 0.4, 0.45, 0.7, 1.3, 1.7, 1.3, 0.8, 0.7, 0.7, 0.7, 0.7, 0.8, 1.1, 1.8, 2.3,
    2.4, 2.0, 1.6, 1.2, 0.9, 0.65,
  ],
  "daytime peak": [
    0.6, 0.55, 0.5, 0.5, 0.55, 0.7, 1.0, 1.2, 1.4, 1.6, 1.7, 1.8, 1.8, 1.8, 1.7, 1.5, 1.5, 1.5,
    1.4, 1.1, 0.9, 0.8, 0.7, 0.6,
  ],
  "night EV charging": [
    2.2, 2.2, 2.2, 2.2, 1.6, 0.7, 1.1, 1.4, 1.0, 0.7, 0.6, 0.6, 0.6, 0.6, 0.7, 0.9, 1.4, 1.8, 1.8,
    1.5, 1.2, 1.0, 1.6, 2.2,
  ],
  "midday EV charging": [
    0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.0, 0.8, 1.6, 2.6, 2.8, 2.8, 2.4, 1.4, 1.2, 1.4, 1.5,
    1.3, 1.0, 0.8, 0.6, 0.5,
  ],
};

function scale(w: number[], total: number): number[] {
  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => (x / s) * total);
}

const PROD_SHAPE = [12, 30, 78, 118, 148, 152, 145, 118, 78, 40, 14, 8]; // Stockholm-like
const CONS_SHAPE = [16, 14.5, 12, 8.5, 5.5, 3.5, 3, 3.5, 5.5, 9, 12.5, 16]; // winter-heavy

const ANNUAL_CONS = 25_000;
const ANNUAL_PROD = 25_000 * 0.6; // ratio 0.6
const PROFILE: LoadProfileClass = "mixed"; // held constant on purpose

const mProd = scale(PROD_SHAPE, ANNUAL_PROD);
const mCons = scale(CONS_SHAPE, ANNUAL_CONS);
const LAT = 59.3;

const annual = modelSelfConsumptionShare(ANNUAL_PROD, ANNUAL_CONS, PROFILE);
const monthly = monthlyShare(mProd, mCons, PROFILE);

function pct(x: number): string {
  return (x * 100).toFixed(1).padStart(5) + "%";
}

console.log("=== controlled test: only the 24h consumption shape varies ===");
console.log(
  `annual consumption ${ANNUAL_CONS} kWh, annual production ${ANNUAL_PROD} kWh (ratio 0.60), profile "${PROFILE}"`,
);
console.log("monthly sums, annual sums and profile factor are IDENTICAL in every row\n");
console.log(
  `${"24h consumption shape".padEnd(22)}  ${"annual".padStart(6)}  ${"monthly".padStart(7)}  ${"hourly".padStart(6)}  ${"kWh self (hourly)".padStart(17)}`,
);

const rows: Array<[string, number]> = [];
for (const [name, shape] of Object.entries(SHAPES)) {
  const h = hourlyShare(mProd, mCons, shape, LAT);
  rows.push([name, h]);
  console.log(
    `${name.padEnd(22)}  ${pct(annual)}  ${pct(monthly)}  ${pct(h)}  ${(h * ANNUAL_PROD).toFixed(0).padStart(17)}`,
  );
}

const hs = rows.map(([, v]) => v);
const spread = Math.max(...hs) - Math.min(...hs);
console.log(
  `\nannual model spread across shapes:  0.0pp (shape is not an input)\nmonthly model spread across shapes: 0.0pp (shape is not an input)\nhourly reference spread:            ${(spread * 100).toFixed(1)}pp  = ${(spread * ANNUAL_PROD).toFixed(0)} kWh/yr`,
);

/* Sanity: verify the two coarse models really are shape-invariant. */
const annualSet = new Set(
  Object.keys(SHAPES).map(() => modelSelfConsumptionShare(ANNUAL_PROD, ANNUAL_CONS, PROFILE)),
);
const monthlySet = new Set(Object.keys(SHAPES).map(() => monthlyShare(mProd, mCons, PROFILE)));
console.log(
  `\nshape-invariance check: annual distinct values=${annualSet.size}, monthly distinct values=${monthlySet.size} (1 = invariant, as expected)`,
);

/* Can the profile factor compensate? Which factor would the hourly reference imply? */
console.log("\n=== implied profile factor per shape (what the hourly reference would need) ===");
const base = modelSelfConsumptionShare(ANNUAL_PROD, ANNUAL_CONS, "mixed");
for (const [name, h] of rows) {
  console.log(`${name.padEnd(22)}  implied factor = ${(h / base).toFixed(2)}`);
}
console.log(
  "\nNote: the hourly reference uses SYNTHETIC diurnal shapes. It shows sensitivity, not truth.",
);
