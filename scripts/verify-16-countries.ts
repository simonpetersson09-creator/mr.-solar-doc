import { runCalculation } from "@/lib/calc/engine";
import { getConnectionConfig } from "@/config/connections";
import { connectionCapacityToMaxAcPowerKw, isValidConnectionCapacity } from "@/config/connection-capacity";
import { getPvConnectionRules, resolvePvPowerLimit } from "@/config/pv-connection-rules";
import { resolveEconomicsDefaults, getCountryConfig } from "@/config/countries";
const P:Record<string,[string,number,number]>={CH:["Bern",46.948,7.447],HU:["Budapest",47.498,19.04],RO:["Bukarest",44.426,26.102],BG:["Sofia",42.698,23.322],RS:["Belgrad",44.787,20.457],TR:["Ankara",39.933,32.86],IS:["Reykjavik",64.147,-21.94],LU:["Luxemburg",49.611,6.13],MT:["Valletta",35.899,14.514],CY:["Nicosia",35.185,33.382],MK:["Skopje",41.998,21.425],AL:["Tirana",41.327,19.818],BA:["Sarajevo",43.856,18.413],ME:["Podgorica",42.441,19.262],NZ:["Auckland",-36.848,174.763],MX:["Monterrey",25.686,-100.316]};
const W=[1.25,1.15,1.05,.9,.8,.7,.7,.75,.9,1.05,1.15,1.25];const mon=(a:number)=>W.map(x=>a*x/W.reduce((p,q)=>p+q,0));
const rows:string[]=[];let fails=0;
for(const [cc,[city,lat,lon]] of Object.entries(P)){
  const az = lat<0?180:0; // PVGIS: 0=söder; norr på södra halvklotet
  let monthly:number[];
  try{const r=await fetch(`https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=14&angle=30&aspect=${az}&outputformat=json`);const j:any=await r.json();monthly=j.outputs.monthly.fixed.map((m:any)=>m.E_m);}catch(e){rows.push(`| ${cc} | BLOCKERAT: PVGIS ${e} |`);fails++;continue}
  const cfg=getConnectionConfig(cc);const t=cfg.capacityInputType;
  const prof={serviceType:cfg.defaultServiceType,voltageV:cfg.defaultVoltage,frequencyHz:cfg.defaultFrequencyHz};
  const cap:any= t==="amperage"?{type:"amperage",amperageA:cfg.defaultServiceType==="single-phase"?40:25,...prof}: t==="contracted-kw"?{type:"contracted-kw",kw:11,...prof}:{type:"contracted-kva",kva:12,...prof};
  if(!isValidConnectionCapacity(cap)){rows.push(`| ${cc} | ogiltig kapacitet |`);fails++;continue}
  const kva=cfg.contractedKvaPowerFactor;const ac=connectionCapacityToMaxAcPowerKw(cap,kva===undefined?{}:{contractedKvaPowerFactor:kva});
  const pv=resolvePvPowerLimit({connectionCapacityKw:ac,rules:getPvConnectionRules(cc),serviceType:cap.serviceType,serviceAmperageA:cap.amperageA??null,voltageV:cap.voltageV});
  const eco=resolveEconomicsDefaults(cc,{selfConsumedValuePerKwh:null,exportValuePerKwh:null});
  const out:string[]=[];let prev=-1;
  for(const yrs of [5,10,15]){
    const o=runCalculation({location:{address:city,latitude:lat,longitude:lon,countryCode:cc,region:""},resource:{annualKwhPerKwp:monthly.reduce((a,b)=>a+b,0),monthlyKwhPerKwp:monthly,orientation:"south",tiltDegrees:30,orientationAssumed:false,tiltAssumed:false,dataSource:"PVGIS 5.3",calculationDate:"2026-10-04"},consumption:{annualKwh:8000,monthlyKwh:mon(8000),inputType:"monthly-manual",isEstimated:false},electrical:{mainFuseAmp:cap.amperageA??null,maxAcPowerKw:ac,connection:cap,serviceType:cap.serviceType,gridVoltageV:cap.voltageV,gridFrequencyHz:cap.frequencyHz,pvPowerLimitKw:pv.maxPvAcKw,pvLimitBinding:pv.binding,pvRulesStatus:pv.rulesStatus,simplifiedProcessLimitKw:pv.simplifiedProcessLimitKw,gridProfileStatus:cfg.status,gridProfileConfirmed:true},economics:{selfConsumedValuePerKwh:eco.selfConsumedValuePerKwh,exportValuePerKwh:eco.exportValuePerKwh,installationCostPerKwp:eco.installationCostPerKwp,gridCompensationPerKwh:eco.gridCompensationPerKwh,gridCompensationEnabled:getCountryConfig(cc).economics.gridCompensation.enabled,currency:eco.currencyCode,valuesMissing:eco.valuesMissing,selfConsumedValueSource:"standard-value",exportValueSource:"standard-value"},selfConsumptionShare:0.4,acceptedPaybackYears:yrs,annualPriceChangeRate:0.02,quotePrice:null} as any);
    if(o.status!=="success"){out.push(`${yrs}å: ${o.status}`);fails++;continue}
    const r:any=o.result;const sum=r.lifetime.years.slice(0,yrs).reduce((a:number,y:any)=>a+y.economicValue,0);
    const bal=Math.abs(r.annualProductionKwh-r.selfConsumedKwh-r.exportedKwh);
    const ok=Math.abs(sum-r.investment.maxInvestment)<0.01&&bal<0.01&&r.investment.maxInvestment>prev&&r.lifetime.years.length>=yrs;
    if(!ok)fails++;prev=r.investment.maxInvestment;
    if(yrs===5)out.push(`${r.inverterKw} kW / ${r.installedKwp.toFixed(2)} kWp | ${Math.round(r.annualProductionKwh)} | ${Math.round(r.selfConsumedKwh)} | ${Math.round(r.exportedKwh)} | ${Math.round(r.investment.annualEconomicValue)} ${eco.currencyCode}`);
    out.push(`${yrs}å ${Math.round(r.investment.maxInvestment)}${ok?" ✓":" ✗"}`);
  }
  rows.push(`| ${cc} ${city} (${lat}, ${lon}) | ${t} ${cap.amperageA??cap.kw??cap.kva} ${cap.serviceType} ${cap.voltageV} V → ${pv.maxPvAcKw.toFixed(2)} kW | ${out.join(" | ")} |`);
}
console.log(rows.join("\n"));console.log("FAILS",fails);
