import { calculateSolarSystem } from "@/lib/calc/engine";
import { MARKETS } from "@/config/markets";

const inverters = MARKETS.SE.inverterSizesKw;

function baseInput(overrides: any = {}) {
  return {
    location: { latitude: 59, longitude: 18, address: "x" },
    resource: {
      annualKwhPerKwp: 1000,
      monthlyKwhPerKwp: [30,50,80,100,120,130,130,110,80,50,30,20],
      orientationAssumed: false,
      tiltAssumed: false,
    },
    consumption: { annualKwh: 5000, monthlyKwh: null, isEstimated: true, inputType: "annual-only" },
    electrical: { mainFuseAmp: 25 },
    inverterSizesKw: inverters,
    selfConsumptionShare: 0.5,
    selfConsumptionShareIsUserSet: false,
    economics: {
      currency: "SEK",
      selfConsumedValuePerKwh: 1.5,
      exportValuePerKwh: 0.5,
      installationCostPerKwp: 15000,
    },
    acceptedPaybackYears: 12,
    annualDegradationRate: 0.005,
    annualPriceChangeRate: 0.02,
    quotePrice: null,
    ...overrides,
  };
}

// Test 1: very low consumption
let r = calculateSolarSystem(baseInput({ consumption: { annualKwh: 200, monthlyKwh: null, isEstimated: true, inputType: "annual-only" } }));
console.log("LOW CONSUMPTION: kwp", r.installedKwp, "inverter", r.inverterKw, "ratio", r.dcAcRatio, "maxAc", r.maxAcPowerKw, "notes", r.notes, "basis", r.sizingBasis);

// Test 2: very high consumption
r = calculateSolarSystem(baseInput({ consumption: { annualKwh: 1_000_000, monthlyKwh: null, isEstimated: true, inputType: "annual-only" } }));
console.log("HIGH CONSUMPTION: kwp", r.installedKwp, "inverter", r.inverterKw, "ratio", r.dcAcRatio, "maxAc", r.maxAcPowerKw, "notes", r.notes, "basis", r.sizingBasis, "annualProd", r.annualProductionKwh);

// Test 3: extreme irradiation (very high kWh/kWp, e.g. desert)
r = calculateSolarSystem(baseInput({ resource: { annualKwhPerKwp: 3000, monthlyKwhPerKwp: [200,220,260,280,300,310,310,290,260,230,200,190], orientationAssumed:false, tiltAssumed:false } }));
console.log("HIGH IRRADIATION: kwp", r.installedKwp, "inverter", r.inverterKw, "ratio", r.dcAcRatio, "annualProd", r.annualProductionKwh);

// Test 4: extreme low irradiation
r = calculateSolarSystem(baseInput({ resource: { annualKwhPerKwp: 50, monthlyKwhPerKwp: [2,3,4,5,6,7,7,6,5,4,3,2], orientationAssumed:false, tiltAssumed:false } }));
console.log("LOW IRRADIATION: kwp", r.installedKwp, "inverter", r.inverterKw, "ratio", r.dcAcRatio, "annualProd", r.annualProductionKwh, "notes", r.notes);

// Test 5: huge main fuse (large grid connection) with moderate consumption
r = calculateSolarSystem(baseInput({ electrical: { mainFuseAmp: 400 } }));
console.log("HUGE FUSE: kwp", r.installedKwp, "inverter", r.inverterKw, "maxAc", r.maxAcPowerKw, "ratio", r.dcAcRatio);

