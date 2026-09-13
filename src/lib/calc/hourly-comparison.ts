import type { HourlyPowerSample } from './clipping';
import { resolveSelfConsumptionShare, splitProduction, type LoadProfileClass } from './self-consumption';
export type HourlyProfile = LoadProfileClass;
// Authored hypotheses, not calibrated data. Same curve every day; no weekend adjustment.
export const DAILY_WEIGHTS: Record<HourlyProfile, readonly number[]> = {
 evening: [0.45,0.4,0.38,0.38,0.4,0.55,0.9,1.25,1.35,1.05,0.75,0.65,0.65,0.65,0.7,0.8,1.05,1.4,1.75,2.05,1.95,1.55,1.15,0.75],
 mixed: [0.55,0.5,0.48,0.48,0.5,0.65,0.9,1.15,1.25,1.15,1.1,1.1,1.15,1.1,1.05,1.05,1.15,1.35,1.5,1.55,1.4,1.15,0.9,0.7],
 daytime: [0.45,0.4,0.38,0.38,0.4,0.5,0.7,0.95,1.2,1.45,1.6,1.7,1.75,1.75,1.7,1.55,1.35,1.1,0.9,0.75,0.65,0.58,0.52,0.48],
 even: Array(24).fill(1),
};
/** Percentages rounded to hundredths while preserving an exact displayed total of 100%. */
export function dailyPercentages(profile: HourlyProfile): number[] {
 const weights=DAILY_WEIGHTS[profile];
 const total=weights.reduce((sum,value)=>sum+value,0);
 if(weights.length!==24||!Number.isFinite(total)||total<=0||weights.some(value=>!Number.isFinite(value)||value<0))throw new Error('invalid-daily-profile');
 const raw=weights.map(value=>value/total*10000);
 const basisPoints=raw.map(Math.floor);
 let remainder=10000-basisPoints.reduce((sum,value)=>sum+value,0);
 const order=raw.map((value,index)=>({index,fraction:value-Math.floor(value)})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
 for(let i=0;i<remainder;i++)basisPoints[order[i]?.index??0]=(basisPoints[order[i]?.index??0]??0)+1;
 return basisPoints.map(value=>value/100);
}
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
/** Local civil time drives both the month bucket and the daily curve hour.
 * Matching between series always uses unambiguous UTC instants, so a missing
 * spring-forward hour simply does not exist and a repeated autumn hour stays two
 * distinct instants: no energy is lost and none is counted twice.
 * The UTC-year window's local boundary hours (local December of the previous
 * year / local January of the next) are folded into the same-named month bucket:
 * an explicit cyclic-year assumption that preserves every hour's energy. */
export function localMonthHour(zone: string): (timestamp: number) => { month: number; hour: number } {
 const formatter = new Intl.DateTimeFormat('en-GB',{timeZone:zone,month:'2-digit',hour:'2-digit',hourCycle:'h23'});
 return (timestamp) => {
  const parts = formatter.formatToParts(new Date(timestamp));
  const month = Number(parts.find(p=>p.type==='month')?.value);
  const hour = Number(parts.find(p=>p.type==='hour')?.value);
  if(!Number.isInteger(month)||month<1||month>12||!Number.isInteger(hour)||hour<0||hour>23)throw new Error('invalid-timezone-mapping');
  return {month:month-1,hour};
 };
}
export function syntheticHours(months: readonly (number|null)[], year: number, zone: string, profile: HourlyProfile): EnergyHour[] {
 if (months.length!==12 || months.some(x=>x===null || !Number.isFinite(x) || x<0)) throw new Error('incomplete-monthly-consumption');
 const localOf = localMonthHour(zone);
 const rows: {timestamp:number;month:number;kwh:number}[]=[]; const totals=Array<number>(12).fill(0);
 for(let timestamp=Date.UTC(year,0,1);timestamp<Date.UTC(year+1,0,1);timestamp+=HOUR){
  const {month,hour}=localOf(timestamp);
  const weight=DAILY_WEIGHTS[profile][hour] ?? 0;
  totals[month]=(totals[month]??0)+weight; rows.push({timestamp,month,kwh:weight});
 }
 return rows.map(row=>({timestamp:row.timestamp,kwh:row.kwh*(months[row.month]??0)/(totals[row.month]??1)}));
}
export function calculateHourly(production: EnergyHour[], consumption: EnergyHour[], year: number, zone: string) {
 const p=validateYear(production,year), c=validateYear(consumption,year);
 const localOf=localMonthHour(zone);
 const months=Array.from({length:12},()=>({production:0,consumption:0,self:0,import:0,export:0}));
 for(const [time,pv] of p){const load=c.get(time);if(load===undefined)throw new Error('unmatched-hour');const m=months[localOf(time).month];if(!m)throw new Error('invalid-month');const self=Math.min(pv,load);m.production+=pv;m.consumption+=load;m.self+=self;m.import+=load-self;m.export+=pv-self;}
 const annual=months.reduce((a,m)=>({production:a.production+m.production,consumption:a.consumption+m.consumption,self:a.self+m.self,import:a.import+m.import,export:a.export+m.export}),{production:0,consumption:0,self:0,import:0,export:0});
 const overlap=months.reduce((s,m)=>s+Math.min(m.production,m.consumption),0);
 if(annual.self>overlap+Math.max(1e-7,overlap*1e-10))throw new Error('monthly-overlap-exceeded');
 return {months,...annual,selfConsumptionRate:annual.production>0?annual.self/annual.production:0,selfSufficiencyRate:annual.consumption>0?annual.self/annual.consumption:0,overlap};
}
export function compareHourly(production: EnergyHour[], consumption: EnergyHour[], year: number, profile: HourlyProfile, zone: string){
 const hourly=calculateHourly(production,consumption,year,zone);
 if(profile==='even')return {hourly,legacy:null};
 const estimate=resolveSelfConsumptionShare({annualProductionKwh:hourly.production,annualConsumptionKwh:hourly.consumption,monthlyProductionKwh:hourly.months.map(m=>m.production),monthlyConsumptionKwh:hourly.months.map(m=>m.consumption),profileClass:profile});
 const split=splitProduction(hourly.production,estimate.share,hourly.consumption,hourly.overlap);
 return {hourly,legacy:{self:split.selfConsumptionKwh,rate:hourly.production>0?split.selfConsumptionKwh/hourly.production:0,import:hourly.consumption-split.selfConsumptionKwh,export:split.exportedKwh}};
}

