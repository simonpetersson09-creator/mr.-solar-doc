import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import tzLookup from 'tz-lookup';
import { Button } from './ui/button';
import { HourlyProfileOverview } from './HourlyProfileOverview';
import { getHourlySeries } from '@/services/hourly-service';
import { productionHours, syntheticHours, compareHourly, type HourlyProfile } from '@/lib/calc/hourly-comparison';
import { estimateMonthlyConsumption } from '@/lib/calc/consumption-shape';
import { getMarketConfig } from '@/config/markets';
import { resolvePvgisOrientation } from '@/services/solar-resource-service';
import type { CalculationResult } from '@/lib/calc/types';
export function HourlyComparison({result}:{result:CalculationResult}){
 const {t,i18n}=useTranslation();const [open,setOpen]=useState(false);const [profile,setProfile]=useState<HourlyProfile>(result.loadProfileClass??'mixed');
 const orientation=resolvePvgisOrientation({...result.location,orientation:result.resource.orientation,tiltDegrees:result.resource.tiltDegrees,azimuthDegrees:result.resource.azimuthDegrees??null});
 const request={latitude:result.location.latitude,longitude:result.location.longitude,...orientation,dcAcRatio:result.installedKwp/result.inverterKw};
 const query=useQuery({queryKey:['hourly-comparison',request],queryFn:()=>getHourlySeries(request),enabled:open,staleTime:86400000,retry:1});
 const comparison=useMemo(()=>{
  if(!query.data)return null;
  try{
   const zone=tzLookup(request.latitude,request.longitude);
   const months=result.consumption.monthlyKwh??estimateMonthlyConsumption(result.consumption.annualKwh,result.consumption.shape??'default',getMarketConfig(result.location.countryCode).defaultConsumptionWeights,result.location.latitude);
   const production=productionHours(query.data.hourly,query.data.year,result.installedKwp,result.inverterKw);
   return {...compareHourly(production,syntheticHours(months,query.data.year,zone,profile),query.data.year,profile,zone),zone};
  }catch{return {error:true};}
 },[query.data,result,profile,request.latitude,request.longitude]);
 const fmt=(v:number)=>v.toLocaleString(i18n.language,{maximumFractionDigits:1});
 return <section className="border-t border-border py-5 space-y-3">
 <Button variant="outline" onClick={()=>setOpen(!open)} aria-expanded={open}>{t('hourly.title')}</Button>
 {open&&<><p className="text-sm text-muted-foreground">{t('hourly.note')}</p>
 <div className="grid grid-cols-2 gap-2">{(['evening','mixed','daytime','uniform'] as const).map(p=><Button className="h-auto min-h-10 whitespace-normal" key={p} variant={p===profile?'default':'outline'} aria-pressed={p===profile} onClick={()=>setProfile(p)}>{p==='uniform'?t('hourly.uniform'):t(`result.loadProfile.${p}`)}</Button>)}</div>
 <p className="text-sm text-muted-foreground">{t(`hourly.profileDescription.${profile}`)}</p>
 <HourlyProfileOverview selected={profile}/>
 {query.isPending&&<p role="status">{t('common.loading')}</p>}
 {(query.isError||(comparison&&'error'in comparison))&&<p role="alert">{t('hourly.error')}</p>}
 {comparison&&!('error'in comparison)&&<><p className="text-xs text-muted-foreground">{t('hourly.time',{zone:comparison.zone,year:query.data?.year})}</p>
 <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-start">kWh</th><th>{t('hourly.old')}</th><th>{t('hourly.new')}</th></tr></thead><tbody>
 {([['self','result.selfConsumption'],['import','hourly.import'],['export','result.exported']] as const).map(([key,label])=><tr key={key}><th className="text-start py-2 font-normal">{t(label)}</th><td className="text-center">{comparison.legacy?fmt(comparison.legacy[key]):'—'}</td><td className="text-center">{fmt(comparison.hourly[key])}</td></tr>)}
 <tr><th className="text-start font-normal">{t('result.selfConsumption')} %</th><td className="text-center">{comparison.legacy?fmt(comparison.legacy.rate*100):'—'}</td><td className="text-center">{fmt(comparison.hourly.selfConsumptionRate*100)}</td></tr>
 <tr><th className="text-start font-normal">Δ pp</th><td>—</td><td className="text-center">{comparison.legacy?fmt((comparison.hourly.selfConsumptionRate-comparison.legacy.rate)*100):'—'}</td></tr>
 <tr><th className="text-start font-normal">{t('hourly.sufficiency')} %</th><td>—</td><td className="text-center">{fmt(comparison.hourly.selfSufficiencyRate*100)}</td></tr>
 </tbody></table></div></>}
 </>}
 </section>;
}
