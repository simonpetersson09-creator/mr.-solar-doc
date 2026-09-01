import { calculateSolarSystem } from "../src/lib/calc/engine";
const r = calculateSolarSystem({
  location:{address:"x",latitude:50.65,longitude:7.32,countryCode:"DE",region:"NRW"},
  resource:{annualKwhPerKwp:979.47,monthlyKwhPerKwp:[30.55,50.4,84.78,112.63,121.4,123.14,122.89,112.2,94.56,64.77,35.97,26.17],orientation:"unknown",tiltDegrees:30,orientationAssumed:true,tiltAssumed:false,dataSource:"PVGIS",calculationDate:"2026-09-01"},
  consumption:{annualKwh:30000,monthlyKwh:[2500,2500,2500,2500,2500,2500,2500,2500,2500,2500,2500,2500]},
  electrical:{mainFuseAmp:35,kwPerAmp:0.69},
  economics:{selfConsumedValuePerKwh:0.30,exportValuePerKwh:0.08,currency:"EUR"},
  selfConsumptionShare:0.4,
  selfConsumptionShareIsUserSet:true,
  acceptedPaybackYears:10, annualPriceChangeRate:0.02,
  inverterSizesKw:[3,3.6,4,5,6,8,10,12,15,17,20,25,30,36,40,50,60],
} as any);
console.log({kwp:r.installedKwp, inverter:r.inverterKw, prod:r.annualProductionKwh, self:r.selfConsumedKwh, exp:r.exportedKwh, share:r.selfConsumptionRate, annual:r.presentation.annualSavings, maxInv:r.investment.maxInvestment, years:r.investment.acceptedPaybackYears});
console.log(r.lifetime.years.slice(0,10).map(y=>Math.round(y.economicValue)));
