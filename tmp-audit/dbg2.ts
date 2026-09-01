import { selectRecommendedSystem } from "@/lib/calc/candidate-selection";
import { MARKETS } from "@/config/markets";
const m = MARKETS["SE"]!;
const MONTHLY=[22,45,90,121,140,137,133,111,74,41,19,5];
const out:any = selectRecommendedSystem({targetKwp:1,referenceKwp:0.53,maxAcPowerKw:17.32,inverterSizesKw:m.inverterSizesKw,panelPowerKwp:0.43,targetRange:{min:1.1,max:1.2},monthlyKwhPerKwp:MONTHLY,annualConsumptionKwh:500,monthlyConsumptionKwh:null,solarSeasonProductionShare:0.65});
console.log(out.status, out.best.installedKwp, out.best.inverterKw, out.best.score);
console.log(out.candidates.sort((a:any,b:any)=>a.score-b.score).slice(0,5).map((c:any)=>[c.installedKwp.toFixed(2),c.inverterKw,c.dcAcRatio.toFixed(3),c.score.toFixed(6)]));
