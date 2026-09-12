/**
 * READ-ONLY MODEL COMPARISON. Not part of the app build, imports production
 * code but changes nothing.
 *
 * Compares three ways of estimating annual self-consumption share:
 *   A) ANNUAL   — today's production model: 0.40 * (P/C)^-0.60 * profileFactor
 *   B) MONTHLY  — candidate: same power law applied per month, then physically
 *                 capped per month
 *   C) HOURLY   — 8760-step overlap reference, built from a synthetic hourly
 *                 series (SYNTHETIC — function check, NOT reality validation)
 *
 * Run: bunx vite-node tmpchk/compare-selfconsumption.ts
 */
import {
  modelSelfConsumptionShare,
  clampShare,
  type LoadProfileClass,
} from "@/lib/calc/self-consumption";

/* ------------------------------------------------------------------ *
 * Shared constants — mirrored from production so the comparison is explicit
 * ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ *
 * B) MONTHLY CANDIDATE — exact formula
 *
 *   ratio_m  = prod_m / cons_m                       (per month)
 *   share_m  = clamp(A * ratio_m^-B * f, MIN, MAX)   (power law on the RATIO)
 *   self_m   = min(share_m * prod_m, prod_m, cons_m) (physical cap last)
 *   share    = Σ self_m / Σ prod_m
 *
 * The power law is applied to the monthly PRODUCTION, never to
 * min(prod_m, cons_m). Applying it to the overlap would count the seasonal
 * restriction twice: min() already removes the part of the production that
 * cannot physically be used, and the power law then removes a further 60 %
 * of what is left. Zero handling: prod_m <= 0 -> self_m = 0; cons_m <= 0 ->
 * self_m = 0; both are returned before the ratio is formed, so no 0/0.
 * ------------------------------------------------------------------ */
function monthlyShare(
  monthlyProd: number[],
  monthlyCons: number[],
  profile: LoadProfileClass = "mixed",
): { share: number; selfKwh: number; perMonth: number[] } {
  const f = PROFILE_FACTOR[profile];
  const perMonth: number[] = [];
  let self = 0;
  let prodTotal = 0;
  for (let m = 0; m < 12; m++) {
    const p = Math.max(0, monthlyProd[m] ?? 0);
    const c = Math.max(0, monthlyCons[m] ?? 0);
    prodTotal += p;
    if (p <= 0 || c <= 0) {
      perMonth.push(0);
      continue;
    }
    const ratio = p / c;
    const shareM = Math.min(MAX, Math.max(MIN, A * Math.pow(ratio, -B) * f));
    const selfM = Math.min(shareM * p, p, c);
    perMonth.push(selfM);
    self += selfM;
  }
  return { share: prodTotal > 0 ? self / prodTotal : 0, selfKwh: self, perMonth };
}

/** Pure monthly overlap, no power law — the theoretical upper bound. */
function monthlyOverlapShare(monthlyProd: number[], monthlyCons: number[]): number {
  let overlap = 0;
  let total = 0;
  for (let m = 0; m < 12; m++) {
    const p = Math.max(0, monthlyProd[m] ?? 0);
    total += p;
    overlap += Math.min(p, Math.max(0, monthlyCons[m] ?? 0));
  }
  return total > 0 ? overlap / total : 0;
}

/* ------------------------------------------------------------------ *
 * C) HOURLY REFERENCE (synthetic series)
 * ------------------------------------------------------------------ */
/** Clear-sky-ish bell over daylight hours, scaled to the month's energy. */
function hourlyProductionForMonth(monthEnergy: number, days: number, daylightH: number): number[] {
  const out: number[] = [];
  const half = daylightH / 2;
  const dayShape: number[] = [];
  for (let h = 0; h < 24; h++) {
    const x = h + 0.5 - 12;
    dayShape.push(Math.abs(x) >= half ? 0 : Math.cos((Math.PI * x) / (2 * half)) ** 2);
  }
  const dayTotal = dayShape.reduce((a, b) => a + b, 0) || 1;
  const perDay = monthEnergy / days;
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) out.push((perDay * (dayShape[h] ?? 0)) / dayTotal);
  }
  return out;
}

/** Diurnal load shapes (24 relative weights). */
const DIURNAL: Record<string, number[]> = {
  // work away, morning + evening peak
  evening: [
    0.5, 0.45, 0.4, 0.4, 0.45, 0.7, 1.3, 1.7, 1.3, 0.8, 0.7, 0.7, 0.7, 0.7, 0.8, 1.1, 1.8, 2.3,
    2.4, 2.0, 1.6, 1.2, 0.9, 0.65,
  ],
  // fairly flat
  mixed: [
    0.7, 0.65, 0.6, 0.6, 0.65, 0.8, 1.1, 1.3, 1.2, 1.1, 1.05, 1.05, 1.1, 1.1, 1.1, 1.2, 1.5, 1.7,
    1.7, 1.5, 1.3, 1.1, 0.9, 0.75,
  ],
  // home during the day / heat pump + appliances midday
  daytime: [
    0.6, 0.55, 0.5, 0.5, 0.55, 0.7, 1.0, 1.2, 1.4, 1.6, 1.7, 1.8, 1.8, 1.8, 1.7, 1.5, 1.5, 1.5,
    1.4, 1.1, 0.9, 0.8, 0.7, 0.6,
  ],
  // EV charging at night on top of an evening household
  night: [
    2.2, 2.2, 2.2, 2.2, 1.6, 0.7, 1.1, 1.4, 1.0, 0.7, 0.6, 0.6, 0.6, 0.6, 0.7, 0.9, 1.4, 1.8, 1.8,
    1.5, 1.2, 1.0, 1.6, 2.2,
  ],
};

function hourlyConsumptionForMonth(monthEnergy: number, days: number, shape: number[]): number[] {
  const total = shape.reduce((a, b) => a + b, 0) || 1;
  const perDay = monthEnergy / days;
  const out: number[] = [];
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) out.push((perDay * (shape[h] ?? 0)) / total);
  }
  return out;
}

function hourlyShare(
  monthlyProd: number[],
  monthlyCons: number[],
  diurnal: number[],
  latitude: number,
): { share: number; selfKwh: number; steps: number } {
  let self = 0;
  let prodTotal = 0;
  let steps = 0;
  for (let m = 0; m < 12; m++) {
    const days = DAYS[m] ?? 30;
    // crude daylight length by month and latitude, only to shape the day
    const decl = 23.45 * Math.sin((2 * Math.PI * (284 + (m * 30.4 + 15))) / 365);
    const rad = Math.PI / 180;
    const cosH = -Math.tan(latitude * rad) * Math.tan(decl * rad);
    const daylightH = cosH <= -1 ? 24 : cosH >= 1 ? 0.1 : (2 * Math.acos(cosH)) / rad / 15;
    const p = hourlyProductionForMonth(Math.max(0, monthlyProd[m] ?? 0), days, Math.max(2, daylightH));
    const c = hourlyConsumptionForMonth(Math.max(0, monthlyCons[m] ?? 0), days, diurnal);
    for (let i = 0; i < p.length; i++) {
      const pi = p[i] ?? 0;
      self += Math.min(pi, c[i] ?? 0);
      prodTotal += pi;
      steps++;
    }
  }
  return { share: prodTotal > 0 ? self / prodTotal : 0, selfKwh: self, steps };
}

/* ------------------------------------------------------------------ *
 * Scenarios
 * ------------------------------------------------------------------ */
function normalise(w: number[]): number[] {
  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => x / s);
}
function scale(w: number[], total: number): number[] {
  return normalise(w).map((x) => x * total);
}

// Production shapes per market (relative monthly yield, Jan..Dec).
const PROD_SHAPE = {
  // Stockholm-like, strong seasonality
  nordic: [12, 30, 78, 118, 148, 152, 145, 118, 78, 40, 14, 8],
  // Madrid-like, flatter
  mediterranean: [78, 92, 122, 135, 148, 158, 165, 155, 130, 100, 78, 70],
  // Singapore-like, flat
  tropical: [95, 98, 102, 100, 98, 96, 98, 100, 102, 100, 96, 95],
};

// Consumption shapes (relative monthly load, Jan..Dec).
const CONS_SHAPE = {
  winterHeavy: [16, 14.5, 12, 8.5, 5.5, 3.5, 3, 3.5, 5.5, 9, 12.5, 16],
  summerHeavy: [5, 5, 6, 7.5, 10, 13, 14.5, 14, 10.5, 7.5, 5.5, 5],
  even: Array(12).fill(1),
};

interface Case {
  name: string;
  latitude: number;
  prodShape: number[];
  consShape: number[];
  diurnal: keyof typeof DIURNAL;
  profile: LoadProfileClass;
  annualCons: number;
  ratios: number[];
}

const cases: Case[] = [
  {
    name: "SE heat pump, winter-heavy, evening load",
    latitude: 59.3,
    prodShape: PROD_SHAPE.nordic,
    consShape: CONS_SHAPE.winterHeavy,
    diurnal: "evening",
    profile: "evening",
    annualCons: 20000,
    ratios: [0.3, 0.6, 1.0, 1.6],
  },
  {
    name: "SE winter-heavy + night EV charging",
    latitude: 59.3,
    prodShape: PROD_SHAPE.nordic,
    consShape: CONS_SHAPE.winterHeavy,
    diurnal: "night",
    profile: "mixed",
    annualCons: 25000,
    ratios: [0.3, 0.6, 1.0, 1.6],
  },
  {
    name: "SE flat load, home during day",
    latitude: 59.3,
    prodShape: PROD_SHAPE.nordic,
    consShape: CONS_SHAPE.even,
    diurnal: "daytime",
    profile: "daytime",
    annualCons: 8000,
    ratios: [0.3, 0.6, 1.0, 1.6],
  },
  {
    name: "ES cooling, summer-heavy, daytime load",
    latitude: 40.4,
    prodShape: PROD_SHAPE.mediterranean,
    consShape: CONS_SHAPE.summerHeavy,
    diurnal: "daytime",
    profile: "daytime",
    annualCons: 6000,
    ratios: [0.3, 0.6, 1.0, 1.6],
  },
  {
    name: "ES summer-heavy, evening load",
    latitude: 40.4,
    prodShape: PROD_SHAPE.mediterranean,
    consShape: CONS_SHAPE.summerHeavy,
    diurnal: "evening",
    profile: "evening",
    annualCons: 6000,
    ratios: [0.3, 0.6, 1.0, 1.6],
  },
  {
    name: "SG tropical, flat cooling, mixed load",
    latitude: 1.3,
    prodShape: PROD_SHAPE.tropical,
    consShape: CONS_SHAPE.even,
    diurnal: "mixed",
    profile: "mixed",
    annualCons: 9000,
    ratios: [0.3, 0.6, 1.0, 1.6],
  },
];

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */
const rows: string[] = [];
const problems: string[] = [];
let hourlySteps = 0;
let hourlyMs = 0;
const errAnnual: number[] = [];
const errMonthly: number[] = [];

function pct(x: number): string {
  return (x * 100).toFixed(1).padStart(5) + "%";
}

for (const c of cases) {
  for (const ratio of c.ratios) {
    const annualProd = c.annualCons * ratio;
    const mProd = scale(c.prodShape, annualProd);
    const mCons = scale(c.consShape, c.annualCons);

    const annual = modelSelfConsumptionShare(annualProd, c.annualCons, c.profile);
    const monthly = monthlyShare(mProd, mCons, c.profile);
    const overlap = monthlyOverlapShare(mProd, mCons);

    const t0 = performance.now();
    const hourly = hourlyShare(mProd, mCons, DIURNAL[c.diurnal]!, c.latitude);
    hourlyMs += performance.now() - t0;
    hourlySteps = hourly.steps;

    // invariants for the monthly candidate
    for (let m = 0; m < 12; m++) {
      const self = monthly.perMonth[m] ?? 0;
      if (!Number.isFinite(self)) problems.push(`${c.name} r=${ratio}: month ${m} not finite`);
      if (self < -1e-9) problems.push(`${c.name} r=${ratio}: month ${m} negative`);
      if (self > (mProd[m] ?? 0) + 1e-6)
        problems.push(`${c.name} r=${ratio}: month ${m} self > production`);
      if (self > (mCons[m] ?? 0) + 1e-6)
        problems.push(`${c.name} r=${ratio}: month ${m} self > consumption`);
    }
    if (monthly.share > overlap + 1e-9)
      problems.push(`${c.name} r=${ratio}: monthly model above its own overlap bound`);

    errAnnual.push(annual - hourly.share);
    errMonthly.push(monthly.share - hourly.share);

    rows.push(
      [
        c.name.padEnd(38),
        `r=${ratio.toFixed(1)}`,
        `prod=${Math.round(annualProd).toString().padStart(6)}`,
        `cons=${c.annualCons.toString().padStart(6)}`,
        `annual=${pct(annual)}`,
        `monthly=${pct(monthly.share)}`,
        `hourly=${pct(hourly.share)}`,
        `mOverlap=${pct(overlap)}`,
        `dA=${((annual - hourly.share) * 100).toFixed(1).padStart(6)}pp`,
        `dM=${((monthly.share - hourly.share) * 100).toFixed(1).padStart(6)}pp`,
      ].join("  "),
    );
  }
}

/* Zero / edge handling for the monthly candidate. */
const zeroChecks: Array<[string, number]> = [
  ["all zero production", monthlyShare(Array(12).fill(0), scale(CONS_SHAPE.even, 5000)).share],
  ["all zero consumption", monthlyShare(scale(PROD_SHAPE.nordic, 5000), Array(12).fill(0)).share],
  [
    "single month with production only",
    monthlyShare(
      [0, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 0, 0],
      [500, 500, 500, 500, 500, 0, 500, 500, 500, 500, 500, 500],
    ).share,
  ],
  [
    "tiny consumption vs big production",
    monthlyShare(scale(PROD_SHAPE.nordic, 20000), scale(CONS_SHAPE.even, 12)).share,
  ],
];

/* Does the annual calibration hold per month? Fit A,B against the hourly
 * reference over all monthly (ratio, share) pairs of the nordic evening case. */
function fitPowerLaw(): { a: number; b: number; n: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of cases) {
    for (const ratio of c.ratios) {
      const mProd = scale(c.prodShape, c.annualCons * ratio);
      const mCons = scale(c.consShape, c.annualCons);
      for (let m = 0; m < 12; m++) {
        const p = mProd[m] ?? 0;
        const cc = mCons[m] ?? 0;
        if (p <= 1 || cc <= 1) continue;
        const days = DAYS[m] ?? 30;
        const decl = 23.45 * Math.sin((2 * Math.PI * (284 + (m * 30.4 + 15))) / 365);
        const rad = Math.PI / 180;
        const cosH = -Math.tan(c.latitude * rad) * Math.tan(decl * rad);
        const daylightH = cosH <= -1 ? 24 : cosH >= 1 ? 0.1 : (2 * Math.acos(cosH)) / rad / 15;
        const ph = hourlyProductionForMonth(p, days, Math.max(2, daylightH));
        const ch = hourlyConsumptionForMonth(cc, days, DIURNAL[c.diurnal]!);
        let self = 0;
        for (let i = 0; i < ph.length; i++) self += Math.min(ph[i] ?? 0, ch[i] ?? 0);
        const share = self / p;
        if (share <= 0 || share >= 1) continue;
        xs.push(Math.log(p / cc));
        ys.push(Math.log(share));
      }
    }
  }
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const slope = num / den;
  return { a: Math.exp(my - slope * mx), b: -slope, n };
}

function stats(v: number[]) {
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const mae = v.reduce((s, x) => s + Math.abs(x), 0) / v.length;
  const max = Math.max(...v.map(Math.abs));
  return { mean, mae, max };
}

console.log("=== per-case comparison (share of production self-consumed) ===");
console.log(rows.join("\n"));
console.log("\n=== zero / edge handling, monthly candidate ===");
for (const [label, value] of zeroChecks) console.log(`${label.padEnd(34)} ${pct(value)}`);
console.log("\n=== error vs synthetic hourly reference ===");
const sa = stats(errAnnual);
const sm = stats(errMonthly);
console.log(
  `annual  model: bias ${(sa.mean * 100).toFixed(1)}pp  MAE ${(sa.mae * 100).toFixed(1)}pp  max ${(sa.max * 100).toFixed(1)}pp`,
);
console.log(
  `monthly model: bias ${(sm.mean * 100).toFixed(1)}pp  MAE ${(sm.mae * 100).toFixed(1)}pp  max ${(sm.max * 100).toFixed(1)}pp`,
);
console.log("\n=== do the annual constants hold per month? ===");
const fit = fitPowerLaw();
console.log(
  `fitted per-month A=${fit.a.toFixed(3)} B=${fit.b.toFixed(3)} (n=${fit.n} month-points); production annual A=${A} B=${B}`,
);
console.log("\n=== cost of the hourly reference ===");
console.log(
  `${hourlySteps} time steps per evaluation, ${cases.reduce((s, c) => s + c.ratios.length, 0)} evaluations in ${hourlyMs.toFixed(1)} ms total (${(hourlyMs / cases.reduce((s, c) => s + c.ratios.length, 0)).toFixed(2)} ms each), 0 network calls`,
);
console.log(`\ninvariant problems: ${problems.length}`);
if (problems.length) console.log(problems.slice(0, 20).join("\n"));
console.log(`clampShare sanity: ${clampShare(2)} ${clampShare(-1)}`);
