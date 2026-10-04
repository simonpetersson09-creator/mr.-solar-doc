import { runCalculation } from "@/lib/calc/engine";
import { getConnectionConfig } from "@/config/connections";
import { connectionCapacityToMaxAcPowerKw } from "@/config/connection-capacity";
import { getPvConnectionRules, resolvePvPowerLimit } from "@/config/pv-connection-rules";
import { resolveEconomicsDefaults, getCountryConfig } from "@/config/countries";
import { hourlySeriesProvider } from "@/lib/pvgis-clipping.functions";
import { computeClippingLoss } from "@/lib/calc/clipping";
const P:Record<string,[string,number,number]>={SE:["Stockholm",59.329,18.069],FI:["Helsingfors",60.17,24.938],DK:["Köpenhamn",55.676,12.568],DE:["Berlin",52.52,13.405],AT:["Wien",48.208,16.373],CZ:["Prag",50.075,14.437],PL:["Warszawa",52.23,21.012],SK:["Bratislava",48.149,17.107],SI:["Ljubljana",46.056,14.506],EE:["Tallinn",59.437,24.754],LV:["Riga",56.95,24.106],LT:["Vilnius",54.687,25.28],NO:["Oslo",59.914,10.752],NL:["Amsterdam",52.368,4.904],GB:["London",51.507,-0.128],BE:["Bryssel",50.85,4.352],FR:["Lyon",45.764,4.836],PT:["Lissabon",38.722,-9.139],ES:["Madrid",40.417,-3.704],IT:["Rom",41.903,12.496],IE:["Dublin",53.35,-6.26],HR:["Zagreb",45.815,15.982],GR:["Aten",37.984,23.728],IL:["Tel Aviv",32.085,34.782],US:["Denver",39.739,-104.99],CA:["Toronto",43.653,-79.383],JP:["Tokyo",35.676,139.65]};
const W=[1.25,1.15,1.05,.9,.8,.7,.7,.75,.9,1.05,1.15,1.25];const mon=(a:number)=>W.map(x=>a*x/W.reduce((p,q)=>p+q,0));
const rows:string[]=[];let fails=0;const only=process.argv[2]?.split(",");
for(const [cc,[city,lat,lon]] of Object.entries(P)){ if(only&&!only.includes(cc))continue;
  let monthly:number[]=[];
  for(let t=0;t<3&&!monthly.length;t++){try{const r=await fetch(`https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=14&angle=30&aspect=0&outputformat=json`);const j:any=await r.json();monthly=j.outputs.monthly.fixed.map((m:any)=>m.E_m);}catch{}}
  if(!monthly.length){rows.push(`| ${cc} | BLOCKERAT: PVGIS svarade inte |`);fails++;continue}
  const cfg=getConnectionConfig(cc);const opt=cfg.connectionOptions.find(o=>o.id===cfg.defaultConnection)??cfg.connectionOptions[Math.floor(cfg.connectionOptions.length/2)];
  const cap:any=opt.capacity;const kva=cfg.contractedKvaPowerFactor;
  const ac=connectionCapacityToMaxAcPowerKw(cap,kva===undefined?{}:{contractedKvaPowerFactor:kva});
  const pv=resolvePvPowerLimit({connectionCapacityKw:ac,rules:getPvConnectionRules(cc),serviceType:cap.serviceType,serviceAmperageA:cap.amperageA??null,voltageV:cap.voltageV});
  const eco=resolveEconomicsDefaults(cc,{selfConsumedValuePerKwh:null,exportValuePerKwh:null});
  const mk=(yrs:number,clipping?:any)=>({location:{address:city,latitude:lat,longitude:lon,countryCode:cc,region:""},resource:{annualKwhPerKwp:monthly.reduce((a,b)=>a+b,0),monthlyKwhPerKwp:monthly,orientation:"south",tiltDegrees:30,orientationAssumed:false,tiltAssumed:false,dataSource:"PVGIS 5.3",calculationDate:"2026-10-04"},consumption:{annualKwh:8000,monthlyKwh:mon(8000),inputType:"monthly-manual",isEstimated:false},electrical:{mainFuseAmp:cap.amperageA??null,maxAcPowerKw:ac,connection:cap,serviceType:cap.serviceType,gridVoltageV:cap.voltageV,gridFrequencyHz:cap.frequencyHz,pvPowerLimitKw:pv.maxPvAcKw,pvLimitBinding:pv.binding,pvRulesStatus:pv.rulesStatus,simplifiedProcessLimitKw:pv.simplifiedProcessLimitKw,busbarBasis:pv.busbarBasis,gridProfileStatus:cfg.status,gridProfileConfirmed:true},economics:{selfConsumedValuePerKwh:eco.selfConsumedValuePerKwh,exportValuePerKwh:eco.exportValuePerKwh,installationCostPerKwp:eco.installationCostPerKwp,gridCompensationPerKwh:eco.gridCompensationPerKwh,gridCompensationEnabled:getCountryConfig(cc).economics.gridCompensation.enabled,currency:eco.currencyCode,valuesMissing:eco.valuesMissing,selfConsumedValueSource:"standard-value",exportValueSource:"standard-value"},selfConsumptionShare:0.4,acceptedPaybackYears:yrs,annualPriceChangeRate:0.02,quotePrice:null,...(clipping?{clipping}:{})} as any);
  const p1:any=runCalculation(mk(10));if(p1.status!=="success"){rows.push(`| ${cc} | ${p1.status} |`);fails++;continue}
  const ratio=p1.result.dcAcRatio??p1.result.selectedDcAcRatio;
  let ser:any;try{ser=await hourlySeriesProvider({latitude:lat,longitude:lon,azimuth:0,tilt:30,dcAcRatio:ratio});}catch(e){rows.push(`| ${cc} | BLOCKERAT timdata: ${e} |`);fails++;continue}
  const model=computeClippingLoss({hourly:ser.hourly,dcAcRatio:ratio,dataSource:ser.dataSource,year:2020});
  // oberoende kontroll: andel av timenergi över 1/ratio av toppeffekt
  let prod=0,clip=0;for(const s of ser.hourly){const pdc=s.powerW*ratio;prod+=pdc;clip+=Math.max(0,pdc-1000);} const indep=prod>0?clip/prod:0;
  const out:string[]=[];let prev=-1;let first:any;
  for(const yrs of [5,10,15]){const o:any=runCalculation(mk(yrs,model));if(o.status!=="success"){out.push(`${yrs}å ${o.status}`);fails++;continue}
    const r=o.result;first??=r;const sum=r.lifetime.years.slice(0,yrs).reduce((a:number,y:any)=>a+y.economicValue,0);
    const bal=Math.abs(r.annualProductionKwh-r.selfConsumedKwh-r.exportedKwh);
    const clipBal=Math.abs(r.clipping.unclippedAnnualProductionKwh-r.clipping.clippedKwh-r.annualProductionKwh);
    const ok=Math.abs(sum-r.investment.maxInvestment)<0.01&&bal<0.01&&clipBal<0.5&&r.investment.maxInvestment>prev&&r.clipping.modelled;
    if(!ok)fails++;prev=r.investment.maxInvestment;out.push(`${Math.round(r.investment.maxInvestment)}${ok?"✓":"✗"}`);}
  const r=first;rows.push(`| ${cc} ${city} | ${cap.amperageA?cap.amperageA+" A":(cap.kw??cap.kva)+(cap.kva?" kVA":" kW")} → ${pv.maxPvAcKw.toFixed(2)} kW | ${r.inverterKw} kW/${r.installedKwp.toFixed(2)} kWp, DC/AC ${ratio.toFixed(2)} | ${Math.round(r.annualProductionKwh)} | ${Math.round(r.selfConsumedKwh)} | ${Math.round(r.exportedKwh)} | ${(r.clipping.lossShare*100).toFixed(2)} % (obero. ${(indep*100).toFixed(2)} %) | ${Math.round(r.investment.annualEconomicValue)} ${eco.currencyCode} | ${out.join(" / ")} |`);
}
console.log(rows.join("\n"));console.log("FAILS",fails);
