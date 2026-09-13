import type { HourlyPowerSample } from './clipping';
import { resolveSelfConsumptionShare, splitProduction } from './self-consumption';
export type HourlyProfile = 'evening' | 'mixed' | 'daytime' | 'uniform';
// Authored hypotheses, not calibrated data. Same curve every day; no weekend adjustment.
export const DAILY_WEIGHTS: Record<HourlyProfile, readonly number[]> = {
 evening: [0.5,0.4,0.4,0.4,0.4,0.5,0.9,1.2,0.8,0.6,0.6,0.6,0.7,0.6,0.6,0.7,1,1.5,2,2.2,2,1.7,1.2,0.7],
 mixed: [0.5,0.4,0.4,0.4,0.4,0.5,0.9,1.2,1,1,1,1.1,1.3,1.1,1,1,1.2,1.5,1.7,1.8,1.6,1.3,1,0.7],
 daytime: [0.4,0.4,0.4,0.4,0.4,0.5,0.8,1.1,1.4,1.7,1.8,1.8,1.9,1.8,1.8,1.7,1.5,1.2,1,0.9,0.8,0.7,0.6,0.5],
 uniform: Array(24).fill(1),
};
export interface EnergyHour { timestamp: number; kwh: number }
const HOUR = 3600000;
export function validateYear(series: EnergyHour[], year: number): Map<number, number> {
 const start = Date.UTC(year,0,1), end = Date.UTC(year+1,0,1);
 const map = new Map<number,number>();
 for (const row of series) {
  if (!Number.isFinite(row.kwh) || row.kwh < 0 || row.timestamp < start || row.timestamp >= end || row.timestamp % HOUR !== 0 || map.has(row.timestamp)) throw new Error('invalid-hourly-series');
  map.set(row.timestamp,row.kwh);
 }
 if (map.size !== (end-start)/HOUR) throw new Error('incomplete-hourly-series');
 return map;
}
/** UTC hour bins; PVGIS minute is an observation offset, not an interval duration. */
export function productionHours(samples: HourlyPowerSample[], year: number, installedKwp: number, inverterKw: number): EnergyHour[] {
 if (!Number.isFinite(installedKwp) || installedKwp < 0 || !Number.isFinite(inverterKw) || inverterKw <= 0) throw new Error('invalid-system');
 let minute: string | undefined;
 const hours = samples.map(s => {
  const m = /^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$/.exec(s.time);
  if (!m || Number(m[5])>59) throw new Error('invalid-timestamp');
  if (minute !== undefined && minute !== m[5]) throw new Error('inconsistent-observation-offset');
  minute = m[5];
  const timestamp = Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]));
  const d = new Date(timestamp);
  if (d.getUTCFullYear()!==Number(m[1]) || d.getUTCMonth()+1!==Number(m[2]) || d.getUTCDate()!==Number(m[3]) || d.getUTCHours()!==Number(m[4]) || !Number.isFinite(s.powerW) || s.powerW<0) throw new Error('invalid-timestamp-or-power');
  return {timestamp,kwh: Math.min(s.powerW/1000*installedKwp,inverterKw)};
 });
 validateYear(hours,year); return hours;
}
/** Monthly energy is explicitly UTC-calendar energy; only curve hour uses local civil time.
 * This avoids fabricated boundary hours. DST repeated hours remain distinct UTC instants. */
export function syntheticHours(months: readonly (number|null)[], year: number, zone: string, profile: HourlyProfile): EnergyHour[] {
 if (months.length!==12 || months.some(x=>x===null || !Number.isFinite(x) || x<0)) throw new Error('incomplete-monthly-consumption');
 const formatter = new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'});
 const rows: EnergyHour[]=[]; const totals=Array<number>(12).fill(0);
 for(let timestamp=Date.UTC(year,0,1);timestamp<Date.UTC(year+1,0,1);timestamp+=HOUR){
  const month=new Date(timestamp).getUTCMonth(); const hour=Number(formatter.format(new Date(timestamp)));
  const weight=DAILY_WEIGHTS[profile][hour] ?? 0;
  totals[month]=(totals[month]??0)+weight; rows.push({timestamp,kwh:weight});
 }
 return rows.map(row=>{const m=new Date(row.timestamp).getUTCMonth();return {...row,kwh:row.kwh*(months[m]??0)/(totals[m]??1)};});
}
export function calculateHourly(production: EnergyHour[], consumption: EnergyHour[], year: number) {
 const p=validateYear(production,year), c=validateYear(consumption,year);
 const months=Array.from({length:12},()=>({production:0,consumption:0,self:0,import:0,export:0}));
 for(const [time,pv] of p){const load=c.get(time);if(load===undefined)throw new Error('unmatched-hour');const m=months[new Date(time).getUTCMonth()];if(!m)throw new Error('invalid-month');const self=Math.min(pv,load);m.production+=pv;m.consumption+=load;m.self+=self;m.import+=load-self;m.export+=pv-self;}
 const annual=months.reduce((a,m)=>({production:a.production+m.production,consumption:a.consumption+m.consumption,self:a.self+m.self,import:a.import+m.import,export:a.export+m.export}),{production:0,consumption:0,self:0,import:0,export:0});
 const overlap=months.reduce((s,m)=>s+Math.min(m.production,m.consumption),0);
 if(annual.self>overlap+Math.max(1e-7,overlap*1e-10))throw new Error('monthly-overlap-exceeded');
 return {months,...annual,selfConsumptionRate:annual.production>0?annual.self/annual.production:0,selfSufficiencyRate:annual.consumption>0?annual.self/annual.consumption:0,overlap};
}
export function compareHourly(production: EnergyHour[], consumption: EnergyHour[], year: number, profile: HourlyProfile){
 const hourly=calculateHourly(production,consumption,year);
 if(profile==='uniform')return {hourly,legacy:null};
 const estimate=resolveSelfConsumptionShare({annualProductionKwh:hourly.production,annualConsumptionKwh:hourly.consumption,monthlyProductionKwh:hourly.months.map(m=>m.production),monthlyConsumptionKwh:hourly.months.map(m=>m.consumption),profileClass:profile});
 const split=splitProduction(hourly.production,estimate.share,hourly.consumption,hourly.overlap);
 return {hourly,legacy:{self:split.selfConsumptionKwh,rate:hourly.production>0?split.selfConsumptionKwh/hourly.production:0,import:hourly.consumption-split.selfConsumptionKwh,export:split.exportedKwh}};
}
