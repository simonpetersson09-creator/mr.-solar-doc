import { calculateSolarSystem } from "@/lib/calc/engine";
import { generateReportBlob } from "@/services/solar-report-service";
import { sv } from "@/i18n/locales/sv";
import { writeFileSync } from "fs";

const monthly = [20,40,80,120,160,175,170,140,95,55,25,15];
const result = calculateSolarSystem({
  location: { address: "Storgatan 12, 123 45 Exempelstad", latitude: 59.3293, longitude: 18.0686, countryCode: "SE", region: "SE3" },
  resource: { annualKwhPerKwp: 917, monthlyKwhPerKwp: monthly.map(v=>v/1.2), orientation: "south", tiltDegrees: 30, azimuthDegrees: 180, orientationAssumed: false, tiltAssumed: false, dataSource: "PVGIS v5.3", calculationDate: new Date().toISOString() },
  consumption: { annualKwh: 12000, monthlyKwh: [1500,1300,1200,900,700,600,600,600,800,1000,1300,1500], inputType: "monthly-manual", isEstimated: false },
  electrical: { mainFuseAmp: 20, kwPerAmp: 0.69 },
  economics: { selfConsumedValuePerKwh: 1.5, exportValuePerKwh: 0.6, currency: "SEK" },
  selfConsumptionShare: 0.5,
  acceptedPaybackYears: 12,
  inverterSizesKw: [3,4,5,6,8,10,12,15],
});
const f = sv.report.fields as any;
const blob = generateReportBlob({ result, locale: "sv-SE", labels: {
  title: sv.report.title, appName: "Mr. Solar Doc", summary: sv.report.summary,
  technical: sv.report.technical, economicSummary: sv.report.economicSummary,
  sizing: sv.report.sizing, production: sv.report.production, consumption: sv.report.consumption,
  economics: sv.report.economics, assumptions: sv.report.assumptions, disclaimer: sv.report.disclaimer,
  generated: sv.report.generated, months: ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"],
  rationale: "", coverageNote: "", paybackNote: "Investeringsnivån är beräknad utifrån vald enkel återbetalningstid och är inte en offert.",
  quoteNote: "", consumptionSource: "Inmatad månadsdata", consumptionShape: null,
  chartProduction: sv.report.chartProduction, chartConsumption: sv.report.chartConsumption,
  origin: sv.report.origin as any, fields: f,
}});
writeFileSync("/tmp/qa/report.pdf", Buffer.from(await blob.arrayBuffer()));
console.log("pages ok");
