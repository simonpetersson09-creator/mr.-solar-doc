/**
 * READ-ONLY validation script (analysis only, no production code changes).
 * Measured household consumption: Ausgrid "Solar home electricity data",
 * 300 NSW homes, 1 Jul 2012 - 30 Jun 2013, half-hourly, CC-BY.
 * Channels: GC = general consumption, CL = controlled load, GG = gross PV generation.
 * Household load used here = GC + CL (measured consumption, NOT net grid import;
 * PV generation is metered separately on GG and is therefore excluded).
 */
import { readFileSync } from 'node:fs';
import { hourlySeriesProvider } from '../src/lib/pvgis-clipping.functions';
import { syntheticHours, type HourlyProfile } from '../src/lib/calc/hourly-comparison';
import { resolveSelfConsumptionShare, splitProduction } from '../src/lib/calc/self-consumption';

const CSV = '/tmp/val/2012-2013 Solar home electricity data v2.csv';
const ZONE = 'Australia/Sydney';
const LAT = -33.8688, LON = 151.2093;
const key = (m: number, d: number, h: number) => m * 10000 + d * 100 + h;

// ---------- measured consumption ----------
type Cust = { hours: Map<number, number>; days: Set<string>; dupes: number; neg: number; kwh: number };
const custs = new Map<string, Cust>();
const lines = readFileSync(CSV, 'utf8').split('\n');
const header = lines[1]!.split(',');
let malformed = 0;
for (let i = 2; i < lines.length; i++) {
 const line = lines[i]!;
 if (!line.trim()) continue;
 const cols = line.split(',');
 if (cols.length < 53) { malformed++; continue; }
 const cat = cols[3]!;
 if (cat !== 'GC' && cat !== 'CL') continue;
 const id = cols[0]!;
 const [dd, mm, yy] = cols[4]!.split('/').map(Number) as [number, number, number];
 let c = custs.get(id);
 if (!c) custs.set(id, (c = { hours: new Map(), days: new Set(), dupes: 0, neg: 0, kwh: 0 }));
 if (cat === 'GC') { const tag = `${yy}-${mm}-${dd}`; if (c.days.has(tag)) c.dupes++; c.days.add(tag); }
 for (let s = 0; s < 48; s++) {
  const v = Number(cols[5 + s]);
  if (!Number.isFinite(v)) { malformed++; continue; }
  if (v < 0) c.neg++;
  // label "H:MM" is the period END; hour bucket of the period start
  const label = header[5 + s]!;
  const [lh, lm] = label.split(':').map(Number) as [number, number];
  const endMinutes = (lh === 0 && s === 47 ? 24 : lh) * 60 + lm;
  const startMinutes = endMinutes - 30;
  const hour = Math.floor(startMinutes / 60);
  const k = key(mm, dd, hour);
  c.hours.set(k, (c.hours.get(k) ?? 0) + v);
  c.kwh += v;
 }
}

// ---------- PVGIS production, one fixed series for every case ----------
const series = await hourlySeriesProvider({ latitude: LAT, longitude: LON, azimuth: 180, tilt: 30, dcAcRatio: 1 });
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const perKwpPerKey = new Map<number, number>();
let pvgisAnnualPerKwp = 0, skippedLeap = 0;
for (const s of series.hourly) {
 const m = /^(\d{4})(\d{2})(\d{2}):(\d{2})/.exec(s.time)!;
 const ts = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!);
 const p = fmt.formatToParts(new Date(ts));
 const mo = +p.find(x => x.type === 'month')!.value, da = +p.find(x => x.type === 'day')!.value, ho = +p.find(x => x.type === 'hour')!.value;
 if (mo === 2 && da === 29) { skippedLeap++; continue; } // 2020 leap day: no measured counterpart
 const k = key(mo, da, ho);
 perKwpPerKey.set(k, (perKwpPerKey.get(k) ?? 0) + s.powerW / 1000);
 pvgisAnnualPerKwp += s.powerW / 1000;
}

function monthTotals(hours: Map<number, number>) {
 const t = Array<number>(12).fill(0);
 for (const [k, v] of hours) t[Math.floor(k / 10000) - 1]! += v;
 return t;
}
function balance(prod: Map<number, number>, cons: Map<number, number>) {
 let self = 0, p = 0, c = 0;
 const keys = new Set([...prod.keys(), ...cons.keys()]);
 for (const k of keys) { const pv = prod.get(k) ?? 0, ld = cons.get(k) ?? 0; self += Math.min(pv, ld); p += pv; c += ld; }
 return { self, production: p, consumption: c, import: c - self, export: p - self, rate: p > 0 ? self / p : 0 };
}
// synthetic profile hours re-keyed to (month,day,hour) local, energy conserving
function profileHours(months: number[], profile: HourlyProfile) {
 const out = new Map<number, number>();
 for (const row of syntheticHours(months, 2020, ZONE, profile)) {
  const p = fmt.formatToParts(new Date(row.timestamp));
  const mo = +p.find(x => x.type === 'month')!.value, da = +p.find(x => x.type === 'day')!.value, ho = +p.find(x => x.type === 'hour')!.value;
  if (mo === 2 && da === 29) continue;
  const k = key(mo, da, ho);
  out.set(k, (out.get(k) ?? 0) + row.kwh);
 }
 // restore exact measured monthly energy after dropping the leap day
 const got = monthTotals(out);
 for (const [k, v] of out) { const mi = Math.floor(k / 10000) - 1; const f = got[mi]! > 0 ? months[mi]! / got[mi]! : 0; out.set(k, v * f); }
 return out;
}

const usable = [...custs.entries()].filter(([, c]) => c.days.size === 365 && c.hours.size === 8760 && c.neg === 0 && c.dupes === 0);
console.log(`# malformed cells: ${malformed}; customers: ${custs.size}; usable full-year: ${usable.length}; leap hours dropped: ${skippedLeap}`);
console.log(`# PVGIS ${series.dataSource} year ${series.year}, Sydney 30deg north, ${pvgisAnnualPerKwp.toFixed(0)} kWh/kWp/yr`);

const ratios = [0.6, 1.0, 1.6];
const profiles: HourlyProfile[] = ['evening', 'mixed', 'daytime', 'uniform'];
const rows: Record<string, number>[] = [];
console.log(['customer', 'annual_kwh', 'ratio', 'kwp', 'ref_self', 'ref_pct', 'profile', 'prof_self', 'prof_pct', 'dev_pp', 'imp_diff', 'exp_diff', 'legacy_self', 'legacy_pct', 'legacy_dev_pp'].join('\t'));
for (const [id, c] of usable) {
 const months = monthTotals(c.hours);
 const annual = months.reduce((a, b) => a + b, 0);
 for (const ratio of ratios) {
  const kwp = (annual * ratio) / pvgisAnnualPerKwp;
  const prod = new Map([...perKwpPerKey].map(([k, v]) => [k, v * kwp]));
  const ref = balance(prod, c.hours);
  const monthlyProd = monthTotals(prod);
  for (const profile of profiles) {
   const p = balance(prod, profileHours(months, profile));
   let legacySelf: number | null = null;
   if (profile !== 'uniform') {
    const est = resolveSelfConsumptionShare({ annualProductionKwh: ref.production, annualConsumptionKwh: annual, monthlyProductionKwh: monthlyProd, monthlyConsumptionKwh: months, profileClass: profile });
    legacySelf = splitProduction(ref.production, est.share, annual, monthlyProd.reduce((s, v, i) => s + Math.min(v, months[i]!), 0)).selfConsumptionKwh;
   }
   const rec = {
    ref_pct: ref.rate * 100, prof_pct: p.rate * 100, dev_pp: (p.rate - ref.rate) * 100,
    legacy_pp: legacySelf === null ? NaN : (legacySelf / ref.production - ref.rate) * 100,
   };
   rows.push({ ratio, ...rec, profileIndex: profiles.indexOf(profile) });
   console.log([id, annual.toFixed(0), ratio, kwp.toFixed(2), ref.self.toFixed(0), ref.rate * 100, profile, p.self.toFixed(0), p.rate * 100, rec.dev_pp, (p.import - ref.import).toFixed(0), (p.export - ref.export).toFixed(0), legacySelf?.toFixed(0) ?? '-', legacySelf === null ? '-' : (legacySelf / ref.production * 100).toFixed(2), Number.isNaN(rec.legacy_pp) ? '-' : rec.legacy_pp.toFixed(2)].map(v => typeof v === 'number' ? v.toFixed(2) : v).join('\t'));
  }
 }
}

// ---------- summary ----------
const q = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]!;
console.log('\n# summary: signed deviation (pp) of hourly profile vs measured reference, and legacy monthly model');
console.log(['ratio', 'profile', 'n', 'median_dev', 'mean_abs', 'p90_abs', 'max_abs', 'legacy_median_dev', 'legacy_mean_abs'].join('\t'));
for (const ratio of ratios) for (const profile of profiles) {
 const sub = rows.filter(r => r.ratio === ratio && r.profileIndex === profiles.indexOf(profile));
 const dev = sub.map(r => r.dev_pp!), abs = dev.map(Math.abs);
 const ld = sub.map(r => r.legacy_pp!).filter(v => !Number.isNaN(v));
 console.log([String(ratio), profile, String(sub.length), q(dev, 0.5).toFixed(2), (abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(2), q(abs, 0.9).toFixed(2), Math.max(...abs).toFixed(2),
  ld.length ? q(ld, 0.5).toFixed(2) : '-', ld.length ? (ld.map(Math.abs).reduce((a, b) => a + b, 0) / ld.length).toFixed(2) : '-'].join('\t'));
}
