import {hourlySeriesProvider} from '../src/lib/pvgis-clipping.functions';
import {productionHours,syntheticHours,compareHourly,type HourlyProfile} from '../src/lib/calc/hourly-comparison';
const zone='Europe/Stockholm';
const cases=[{name:'låg produktion',kwp:5,inv:5,annual:15000},{name:'jämförbar',kwp:10,inv:9,annual:10000},{name:'hög produktion',kwp:20,inv:15,annual:8000},{name:'kapning DC/AC 1,3',kwp:13,inv:10,annual:10000}];
const seasonal=[1400,1200,1000,800,600,500,450,500,700,900,1150,1300];
const flat=Array(12).fill(1000);
const series=await hourlySeriesProvider({latitude:59.3293,longitude:18.0686,azimuth:0,tilt:30,dcAcRatio:1.3});
for(const c of cases){
 const pv=productionHours(series.hourly,series.year,c.kwp,c.inv);
 for(const shape of [['säsong',seasonal],['jämn månad',flat]] as const){
  const scale=c.annual/(shape[1] as number[]).reduce((a,b)=>a+b,0);
  const months=(shape[1] as number[]).map(v=>v*scale);
  for(const p of ['evening','mixed','daytime','uniform'] as HourlyProfile[]){
   const r=compareHourly(pv,syntheticHours(months,series.year,zone,p),series.year,p,zone);
   const f=(x:number)=>Math.round(x).toLocaleString('sv-SE');
   console.log([c.name,shape[0],p,f(r.hourly.production),f(r.hourly.consumption),f(r.hourly.self),(r.hourly.selfConsumptionRate*100).toFixed(1),(r.hourly.selfSufficiencyRate*100).toFixed(1),f(r.hourly.import),f(r.hourly.export),r.legacy?f(r.legacy.self):'—',r.legacy?(r.legacy.rate*100).toFixed(1):'—',r.legacy?((r.hourly.selfConsumptionRate-r.legacy.rate)*100).toFixed(1):'—',(r.hourly.self<=r.hourly.overlap+1e-6)?'ok':'ÖVER'].join('\t'));
  }
 }
}
// nollfall
const zeroLoad=syntheticHours(Array(12).fill(0),series.year,zone,'mixed');
const pv=productionHours(series.hourly,series.year,10,9);
const zeroPv=pv.map(r=>({...r,kwh:0}));
console.log('nollförbrukning',JSON.stringify(compareHourly(pv,zeroLoad,series.year,'mixed',zone).hourly.selfConsumptionRate));
console.log('nollproduktion',JSON.stringify(compareHourly(zeroPv,syntheticHours(flat,series.year,zone,'mixed'),series.year,'mixed',zone).hourly.selfSufficiencyRate));
