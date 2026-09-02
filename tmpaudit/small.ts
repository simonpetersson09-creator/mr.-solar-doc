import { calculateSolarSystem } from "@/lib/calc/engine";
const south=[65,80,115,135,160,175,180,165,130,100,70,58];
function run(cons:number, catalogCountry:string, service:any, amps:number, volt:number, pv:number|null, binding:any){
  const r=calculateSolarSystem({
    location:{countryCode:catalogCountry,address:"x",latitude:40,longitude:-100},
    resource:{annualKwhPerKwp:south.reduce((a,b)=>a+b,0),monthlyKwhPerKwp:south,orientation:"south",dataSource:"test"} as any,
    consumption:{annualKwh:cons,monthlyKwh:null,inputType:"annual-only",shape:null,isEstimated:false},
    electrical:{mainFuseAmp:amps,maxAcPowerKw:amps*volt*(service==="split-phase"?1:1.732)/1000,serviceType:service,gridVoltageV:volt,gridPhases:service==="split-phase"?1:3,
      connection:{type:"amperage",amperageA:amps,voltageV:volt} as any,
      pvPowerLimitKw:pv, pvLimitBinding:binding, pvRulesStatus:"verified", simplifiedProcessLimitKw:null},
    economics:{selfConsumedValuePerKwh:0.15,exportValuePerKwh:0.05,currency:"USD"} as any,
    acceptedPaybackYears:12, selfConsumptionShare:0.4, annualPriceChangeRate:0.03,
  } as any);
  console.log(catalogCountry,cons,"kWp",r.installedKwp,"inv",r.inverterKw,"dcac",r.dcAcRatio.toFixed(2),"cov",r.presentation.productionCoveragePercent+"%","notes",r.notes.filter(n=>n.includes("limit")||n.includes("minimum")).join(","));
}
run(2000,"US","split-phase",200,240,9.6,"busbar-rule");
run(2000,"CA","split-phase",200,240,9.6,"busbar-rule");
run(2000,"JP","split-phase",60,200,null,"connection-capacity");
run(6000,"US","split-phase",200,240,9.6,"busbar-rule");
run(20000,"US","split-phase",200,240,9.6,"busbar-rule");
run(2000,"SE","three-phase",25,400,43.5,"connection-capacity");
run(6000,"SE","three-phase",25,400,43.5,"connection-capacity");
run(40000,"DK","three-phase",25,400,11,"pv-rule");
