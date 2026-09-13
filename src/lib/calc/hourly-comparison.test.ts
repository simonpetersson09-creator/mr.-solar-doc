import {describe,it,expect} from 'vitest';
import {syntheticHours,calculateHourly,productionHours,compareHourly,validateYear,localMonthHour,DAILY_WEIGHTS,dailyPercentages, type HourlyProfile} from './hourly-comparison';
const months=Array.from({length:12},(_,i)=>100*(i+1));
const zones=['Europe/Stockholm','America/Los_Angeles','Australia/Sydney','UTC'];
describe('isolated hourly comparison',()=>{
 it('defines smooth, normalized daily standard profiles',()=>{
  for(const profile of ['evening','mixed','daytime','uniform'] as HourlyProfile[]){
   const weights=DAILY_WEIGHTS[profile];const percentages=dailyPercentages(profile);
   expect(weights).toHaveLength(24);expect(weights.every(value=>Number.isFinite(value)&&value>0)).toBe(true);
   expect(Math.max(...weights.slice(1).map((value,index)=>Math.abs(value-(weights[index]??value))))).toBeLessThanOrEqual(0.4);
   expect(percentages).toHaveLength(24);expect(percentages.reduce((sum,value)=>sum+value,0)).toBeCloseTo(100,10);
  }
  const sum=(profile:HourlyProfile,start:number,end:number)=>DAILY_WEIGHTS[profile].slice(start,end).reduce((total,value)=>total+value,0);
  expect(sum('evening',17,23)).toBeGreaterThan(sum('evening',10,16));
  expect(Math.max(...DAILY_WEIGHTS.evening.slice(6,10))).toBeGreaterThan(Math.max(...DAILY_WEIGHTS.evening.slice(10,16)));
  expect(Math.max(...DAILY_WEIGHTS.mixed)/Math.min(...DAILY_WEIGHTS.mixed)).toBeLessThan(3.5);
  expect(sum('daytime',8,18)).toBeGreaterThan(sum('daytime',0,8)+sum('daytime',18,24));
  expect(new Set(DAILY_WEIGHTS.uniform)).toEqual(new Set([1]));
 });
 for(const year of [2019,2020])for(const zone of zones)for(const profile of ['evening','mixed','daytime','uniform'] as HourlyProfile[])it(`${profile} preserves local monthly energy ${zone} ${year}`,()=>{
 const rows=syntheticHours(months,year,zone,profile);expect(rows.length).toBe(year===2020?8784:8760);
 const localOf=localMonthHour(zone);
 for(let m=0;m<12;m++){const values=rows.filter(r=>localOf(r.timestamp).month===m);expect(values.reduce((s,r)=>s+r.kwh,0)).toBeCloseTo(months[m]??0,7);if(profile==='uniform')expect(new Set(values.map(r=>r.kwh)).size).toBe(1);}
 expect(rows.reduce((s,r)=>s+r.kwh,0)).toBeCloseTo(7800,6);
 const result=calculateHourly(rows,[...rows].reverse(),year,zone);expect(result.self).toBeCloseTo(7800,6);expect(result.import).toBeCloseTo(0,7);expect(result.export).toBeCloseTo(0,7);expect(result.self).toBeLessThanOrEqual(result.overlap+1e-7);
 });
 it('rejects gaps duplicates invalid years and unknown months',()=>{const rows=syntheticHours(months,2020,'UTC','mixed');expect(()=>validateYear(rows.slice(1),2020)).toThrow();expect(()=>validateYear([...rows,rows[0] as typeof rows[number]],2020)).toThrow();expect(()=>validateYear(rows,2019)).toThrow();expect(()=>syntheticHours([null,...months.slice(1)],2020,'UTC','mixed')).toThrow();});
 it('zero denominators are explicit; no invented legacy uniform',()=>{const rows=syntheticHours(Array(12).fill(0),2020,'UTC','uniform');const result=compareHourly(rows,rows,2020,'uniform','UTC');expect(result.legacy).toBeNull();expect(result.hourly.selfConsumptionRate).toBe(0);expect(result.hourly.selfSufficiencyRate).toBe(0);});
 it('caps once with no profile multiplier, independently checked flat load',()=>{const load=syntheticHours(Array(12).fill(1000),2020,'UTC','uniform');const samples=load.map(r=>({time:new Date(r.timestamp).toISOString().replace(/[-T]/g,'').slice(0,8)+':'+new Date(r.timestamp).toISOString().slice(11,13)+'10',powerW:2000}));const pv=productionHours(samples,2020,2,3);expect(pv.every(r=>r.kwh===3)).toBe(true);const result=calculateHourly(pv,load,2020,'UTC');expect(result.production).toBe(8784*3);expect(result.self).toBeCloseTo(12000,7);expect(result.import).toBe(0);});
 it('DST: missing hour is absent, repeated hour counted once each, local months keep actual lengths',()=>{
  const rows=syntheticHours(months,2020,'Europe/Stockholm','evening');
  const localOf=localMonthHour('Europe/Stockholm');
  const map=new Map(rows.map(r=>[r.timestamp,r.kwh]));
  // Autumn repeat: 02:00 local occurs at 00:00 and 01:00 UTC, two distinct instants.
  expect(localOf(Date.UTC(2020,9,25,0)).hour).toBe(2);expect(localOf(Date.UTC(2020,9,25,1)).hour).toBe(2);
  expect(map.get(Date.UTC(2020,9,25,0))).toBeCloseTo(map.get(Date.UTC(2020,9,25,1)) as number,12);
  // Spring forward: local 02:00 on 29 March never occurs, so no hour maps to it.
  expect(rows.filter(r=>{const d=new Date(r.timestamp);return d.getUTCMonth()===2&&localOf(r.timestamp).hour===2&&d.getUTCDate()===29;})).toHaveLength(0);
  expect(rows.filter(r=>localOf(r.timestamp).month===2)).toHaveLength(743);
  expect(rows.filter(r=>localOf(r.timestamp).month===9)).toHaveLength(745);
 });
 it('local month buckets differ from UTC buckets at boundaries but conserve energy',()=>{
  const rows=syntheticHours(months,2020,'Australia/Sydney','daytime');
  const localOf=localMonthHour('Australia/Sydney');
  const utcJan=rows.filter(r=>new Date(r.timestamp).getUTCMonth()===0).reduce((s,r)=>s+r.kwh,0);
  const localJan=rows.filter(r=>localOf(r.timestamp).month===0).reduce((s,r)=>s+r.kwh,0);
  expect(localJan).toBeCloseTo(100,7);expect(Math.abs(utcJan-100)).toBeGreaterThan(0.5);
  expect(rows.reduce((s,r)=>s+r.kwh,0)).toBeCloseTo(7800,6);
 });
});
