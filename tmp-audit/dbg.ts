import { calculateSolarSystem } from "@/lib/calc/engine";
import { MARKETS } from "@/config/markets";
const market = MARKETS["SE"]!;
const MONTHLY = [22,45,90,121,140,137,133,111,74,41,19,5];
const r = calculateSolarSystem({
  location:{address:"x",latitude:59.33,longitude:18.07,countryCode:"SE",region:"S"},
  resource:{annualKwhPerKwp:MONTHLY.reduce((a,b)=>a+b,0),monthlyKwhPerKwp:MONTHLY,orientation:"south",tiltDegrees:30,orientationAssumed:false,tiltAssumed:false,dataSource:"t",calculationDate:"2026-01-01"},
  consumption:{annualKwh:500,monthlyKwh:null},
  electrical:{mainFuseAmp:25,kwPerAmp:market.kwPerAmp} as any,
  economics:{selfConsumedValuePerKwh:1.5,exportValuePerKwh:0.6,currency:"SEK"} as any,
  selfConsumptionShare:0.5,acceptedPaybackYears:12,inverterSizesKw:market.inverterSizesKw,
} as any);
console.log(r.installedKwp, r.panelCount, r.inverterKw, r.sizingBasis, r.notes, Math.min(...market.inverterSizesKw));
