import {describe,it,expect} from 'vitest';
import {syntheticHours,calculateHourly,productionHours,compareHourly,validateYear, type HourlyProfile} from './hourly-comparison';
const months=Array.from({length:12},(_,i)=>100*(i+1));
describe('isolated hourly comparison',()=>{
 for(const year of [2019,2020])for(const profile of ['evening','mixed','daytime','uniform'] as HourlyProfile[])it(`${profile} preserves monthly energy ${year}`,()=>{
 const rows=syntheticHours(months,year,'Europe/Stockholm',profile);expect(rows.length).toBe(year===2020?8784:8760);
 for(let m=0;m<12;m++){const values=rows.filter(r=>new Date(r.timestamp).getUTCMonth()===m);expect(values.reduce((s,r)=>s+r.kwh,0)).toBeCloseTo(months[m]??0,7);if(profile==='uniform')expect(new Set(values.map(r=>r.kwh)).size).toBe(1);}
 const result=calculateHourly(rows,[...rows].reverse(),year);expect(result.self).toBeCloseTo(7800,7);expect(result.import).toBe(0);expect(result.export).toBe(0);expect(result.self).toBeLessThanOrEqual(result.overlap+1e-7);
 });
 it('rejects gaps duplicates invalid years and unknown months',()=>{const rows=syntheticHours(months,2020,'UTC','mixed');expect(()=>validateYear(rows.slice(1),2020)).toThrow();expect(()=>validateYear([...rows,rows[0] as typeof rows[number]],2020)).toThrow();expect(()=>validateYear(rows,2019)).toThrow();expect(()=>syntheticHours([null,...months.slice(1)],2020,'UTC','mixed')).toThrow();});
 it('zero denominators are explicit; no invented legacy uniform',()=>{const rows=syntheticHours(Array(12).fill(0),2020,'UTC','uniform');const result=compareHourly(rows,rows,2020,'uniform');expect(result.legacy).toBeNull();expect(result.hourly.selfConsumptionRate).toBe(0);expect(result.hourly.selfSufficiencyRate).toBe(0);});
 it('caps once with no profile multiplier, independently checked flat load',()=>{const load=syntheticHours(Array(12).fill(1000),2020,'UTC','uniform');const samples=load.map(r=>({time:new Date(r.timestamp).toISOString().replace(/[-T]/g,'').slice(0,8)+':'+new Date(r.timestamp).toISOString().slice(11,13)+'10',powerW:2000}));const pv=productionHours(samples,2020,2,3);expect(pv.every(r=>r.kwh===3)).toBe(true);const result=calculateHourly(pv,load,2020);expect(result.production).toBe(8784*3);expect(result.self).toBeCloseTo(12000,7);expect(result.import).toBe(0);});
 it('DST maps actual local hours while uniform remains constant',()=>{const rows=syntheticHours(months,2020,'Europe/Stockholm','evening');const map=new Map(rows.map(r=>[r.timestamp,r.kwh]));expect(map.get(Date.UTC(2020,9,25,0))).toBe(map.get(Date.UTC(2020,9,25,1)));expect(rows.filter(r=>new Date(r.timestamp).getUTCMonth()===2)).toHaveLength(744);});
});
