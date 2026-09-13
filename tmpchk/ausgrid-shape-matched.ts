/** READ-ONLY: deviation when each household is assigned the profile that matches
 * its own measured daily shape (characteristic-based assignment, not error-based),
 * plus a clipped case (DC/AC 1.30, inverter cap applied once). */
import { readFileSync } from 'node:fs';
import { DAILY_WEIGHTS, syntheticHours, type HourlyProfile } from '../src/lib/calc/hourly-comparison';
import { hourlySeriesProvider } from '../src/lib/pvgis-clipping.functions';
const CSV = '/tmp/val/2012-2013 Solar home electricity data v2.csv';
const ZONE = 'Australia/Sydney';
const key = (m: number, d: number, h: number) => m * 10000 + d * 100 + h;
const lines = readFileSync(CSV, 'utf8').split('\n');
const header = lines[1]!.split(',');
type C = { hours: Map<number, number>; shape: number[]; days: Set<string> };
const custs = new Map<string, C>();
for (let i = 2; i < lines.length; i++) {
 const cols = lines[i]!.split(','); if (cols.length < 53) continue;
 if (cols[3] !== 'GC' && cols[3] !== 'CL') continue;
 const [dd, mm] = cols[4]!.split('/').map(Number) as [number, number];
 let c = custs.get(cols[0]!); if (!c) custs.set(cols[0]!, (c = { hours: new Map(), shape: Array(24).fill(0), days: new Set() }));
 if (cols[3] === 'GC') c.days.add(cols[4]!);
 for (let s = 0; s < 48; s++) {
  const v = Number(cols[5 + s]); if (!Number.isFinite(v)) continue;
  const [lh, lm] = header[5 + s]!.split(':').map(Number) as [number, number];
  const h = Math.floor((((lh === 0 && s === 47) ? 24 : lh) * 60 + lm - 30) / 60);
  c.hours.set(key(mm, dd, h), (c.hours.get(key(mm, dd, h)) ?? 0) + v); c.shape[h]! += v;
 }
}
const series = await hourlySeriesProvider({ latitude: -33.8688, longitude: 151.2093, azimuth: 180, tilt: 30, dcAcRatio: 1 });
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const localKey = (ts: number) => { const p = fmt.formatToParts(new Date(ts)); const g = (t: string) => +p.find(x => x.type === t)!.value; return { mo: g('month'), da: g('day'), k: key(g('month'), g('day'), g('hour')) }; };
const perKwp = new Map<number, number>(); let annualPerKwp = 0;
for (const s of series.hourly) {
 const m = /^(\d{4})(\d{2})(\d{2}):(\d{2})/.exec(s.time)!;
 const { mo, da, k } = localKey(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!));
 if (mo === 2 && da === 29) continue;
 perKwp.set(k, (perKwp.get(k) ?? 0) + s.powerW / 1000); annualPerKwp += s.powerW / 1000;
}
const profiles: HourlyProfile[] = ['evening', 'mixed', 'daytime', 'uniform'];
const norm = (a: number[]) => { const s = a.reduce((x, y) => x + y, 0) / 24; return a.map(v => v / s); };
const rmse = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0) / 24);
const monthTotals = (h: Map<number, number>) => { const t = Array<number>(12).fill(0); for (const [k, v] of h) t[Math.floor(k / 10000) - 1]! += v; return t; };
function profileHours(months: number[], profile: HourlyProfile) {
 const out = new Map<number, number>();
 for (const r of syntheticHours(months, 2020, ZONE, profile)) { const { mo, da, k } = localKey(r.timestamp); if (mo === 2 && da === 29) continue; out.set(k, (out.get(k) ?? 0) + r.kwh); }
 const got = monthTotals(out);
 for (const [k, v] of out) { const mi = Math.floor(k / 10000) - 1; out.set(k, v * (got[mi]! > 0 ? months[mi]! / got[mi]! : 0)); }
 return out;
}
const bal = (p: Map<number, number>, c: Map<number, number>) => { let self = 0, pp = 0; for (const k of new Set([...p.keys(), ...c.keys()])) { const a = p.get(k) ?? 0, b = c.get(k) ?? 0; self += Math.min(a, b); pp += a; } return { self, rate: pp > 0 ? self / pp : 0 }; };
const q = (a: number[], f: number) => a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))]!;
const usable = [...custs.entries()].filter(([, c]) => c.days.size === 365 && c.hours.size === 8760);
for (const clip of [false, true]) {
 const devs: number[] = []; const assigned: Record<string, number> = {};
 for (const [, c] of usable) {
  const n = norm(c.shape);
  const best = profiles.reduce((a, b) => rmse(n, norm([...DAILY_WEIGHTS[b]])) < rmse(n, norm([...DAILY_WEIGHTS[a]])) ? b : a);
  assigned[best] = (assigned[best] ?? 0) + 1;
  const months = monthTotals(c.hours); const annual = months.reduce((a, b) => a + b, 0);
  const kwp = annual / annualPerKwp; const invKw = clip ? kwp / 1.3 : Infinity;
  const prod = new Map([...perKwp].map(([k, v]) => [k, Math.min(v * kwp, invKw)]));
  devs.push((bal(prod, profileHours(months, best)).rate - bal(prod, c.hours).rate) * 100);
 }
 const abs = devs.map(Math.abs);
 console.log(`clipping=${clip} n=${usable.length} assigned=${JSON.stringify(assigned)} median_dev=${q(devs, 0.5).toFixed(2)}pp mean_abs=${(abs.reduce((a, b) => a + b) / abs.length).toFixed(2)}pp p90_abs=${q(abs, 0.9).toFixed(2)}pp max_abs=${Math.max(...abs).toFixed(2)}pp`);
}
