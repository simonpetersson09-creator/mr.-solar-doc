/** READ-ONLY analysis: (a) measured daily load shape vs the authored DAILY_WEIGHTS
 * curves, chosen on consumption characteristics only; (b) weather-year sensitivity
 * of the production series with consumption held constant. */
import { readFileSync } from 'node:fs';
import { DAILY_WEIGHTS, type HourlyProfile } from '../src/lib/calc/hourly-comparison';

const CSV = '/tmp/val/2012-2013 Solar home electricity data v2.csv';
const lines = readFileSync(CSV, 'utf8').split('\n');
const header = lines[1]!.split(',');
type C = { hour: number[]; weekend: number[]; weekday: number[]; days: Set<string>; total: number };
const custs = new Map<string, C>();
for (let i = 2; i < lines.length; i++) {
 const cols = lines[i]!.split(',');
 if (cols.length < 53) continue;
 if (cols[3] !== 'GC' && cols[3] !== 'CL') continue;
 const id = cols[0]!;
 const [dd, mm, yy] = cols[4]!.split('/').map(Number) as [number, number, number];
 let c = custs.get(id);
 if (!c) custs.set(id, (c = { hour: Array(24).fill(0), weekend: Array(24).fill(0), weekday: Array(24).fill(0), days: new Set(), total: 0 }));
 if (cols[3] === 'GC') c.days.add(cols[4]!);
 const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
 for (let s = 0; s < 48; s++) {
  const v = Number(cols[5 + s]); if (!Number.isFinite(v)) continue;
  const [lh, lm] = header[5 + s]!.split(':').map(Number) as [number, number];
  const h = Math.floor((((lh === 0 && s === 47) ? 24 : lh) * 60 + lm - 30) / 60);
  c.hour[h]! += v; c.total += v;
  if (dow === 0 || dow === 6) c.weekend[h]! += v; else c.weekday[h]! += v;
 }
}
const usable = [...custs.entries()].filter(([, c]) => c.days.size === 365);
const norm = (a: number[]) => { const s = a.reduce((x, y) => x + y, 0) / 24; return a.map(v => v / s); };
const profiles: HourlyProfile[] = ['evening', 'mixed', 'daytime', 'uniform'];
const rmse = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0) / 24);

const fleet = Array(24).fill(0) as number[];
for (const [, c] of usable) { const n = norm(c.hour); for (let h = 0; h < 24; h++) fleet[h]! += n[h]! / usable.length; }
console.log('# measured fleet-average normalised daily load curve (mean = 1.00), n =', usable.length);
console.log(fleet.map((v, h) => `${h}:${v.toFixed(2)}`).join(' '));
console.log('# shape RMSE of each authored curve vs fleet curve (lower = closer load shape)');
for (const p of profiles) console.log(p, rmse(fleet, norm([...DAILY_WEIGHTS[p]])).toFixed(3));
const counts = Object.fromEntries(profiles.map(p => [p, 0]));
for (const [, c] of usable) {
 const n = norm(c.hour);
 const best = profiles.reduce((a, b) => rmse(n, norm([...DAILY_WEIGHTS[b]])) < rmse(n, norm([...DAILY_WEIGHTS[a]])) ? b : a);
 counts[best]!++;
}
console.log('# households whose own measured shape is closest to each curve:', JSON.stringify(counts));
let wkFleet = 0;
for (const [, c] of usable) { const wd = c.weekday.reduce((a, b) => a + b, 0) / 261, we = c.weekend.reduce((a, b) => a + b, 0) / 104; wkFleet += (we / wd) / usable.length; }
console.log('# weekend/weekday daily-energy ratio (fleet mean):', wkFleet.toFixed(3));
const midday = fleet.slice(9, 16).reduce((a, b) => a + b, 0) / 7, evening = fleet.slice(17, 22).reduce((a, b) => a + b, 0) / 5;
console.log(`# fleet midday(09-15) ${midday.toFixed(2)} vs evening(17-21) ${evening.toFixed(2)} -> evening-dominant load`);

// ---------- weather-year sensitivity, consumption unchanged ----------
const base = 'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc';
const sydney = { lat: -33.8688, lon: 151.2093, angle: 30, aspect: 180 };
console.log('\n# PVGIS-ERA5 hourly production per kWp, Sydney 30deg north, consumption held constant');
console.log(['year', 'kWh/kWp', 'dev_vs_2020_%'].join('\t'));
const yearly: Record<number, number> = {};
for (const year of [2016, 2017, 2018, 2019, 2020]) {
 const url = `${base}?lat=${sydney.lat}&lon=${sydney.lon}&angle=${sydney.angle}&aspect=${sydney.aspect}&startyear=${year}&endyear=${year}&pvcalculation=1&peakpower=1&loss=14&pvtechchoice=crystSi&mountingplace=building&outputformat=json&raddatabase=PVGIS-ERA5`;
 const res = await fetch(url);
 if (!res.ok) { console.log(year, 'HTTP', res.status); continue; }
 const json = await res.json() as { outputs: { hourly: { P: number }[] } };
 yearly[year] = json.outputs.hourly.reduce((s, r) => s + r.P / 1000, 0);
}
for (const [y, v] of Object.entries(yearly)) console.log([y, v.toFixed(0), (((v - yearly[2020]!) / yearly[2020]!) * 100).toFixed(2)].join('\t'));
