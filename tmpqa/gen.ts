import { calculateSolarSystem } from "@/lib/calc/engine";
import { MARKETS } from "@/config/markets";
import { generateReportBlob, type ReportLabels } from "@/services/solar-report-service";
import { sv } from "@/i18n/locales/sv";
import { writeFileSync } from "fs";

const M = [22,45,90,121,140,137,133,111,74,41,19,5];
const market = MARKETS["SE"]!;
const result = calculateSolarSystem({
  location: { address: "Testgatan 1, Stockholm", latitude: 59.33, longitude: 18.07, countryCode: "SE", region: "Stockholm" },
  resource: { annualKwhPerKwp: M.reduce((a,b)=>a+b,0), monthlyKwhPerKwp: M, orientation: "south", tiltDegrees: 30, orientationAssumed: false, tiltAssumed: false, dataSource: "PVGIS test", calculationDate: "2026-01-01" },
  consumption: { annualKwh: 18000, monthlyKwh: null },
  electrical: { mainFuseAmp: 25, kwPerAmp: market.kwPerAmp },
  economics: { selfConsumedValuePerKwh: 1.5, exportValuePerKwh: 0.6, currency: "SEK" },
  selfConsumptionShare: 0.5,
  acceptedPaybackYears: 12,
  inverterSizesKw: market.inverterSizesKw,
} as any);

const r: any = sv.report;
const labels = {
  ...r,
  title: r.title, appName: sv.app.name, months: ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"],
  rationale: "", coverageNote: "", paybackNote: "", quoteNote: "",
  consumptionSource: "Angiven årsförbrukning", consumptionShape: null,
  economicsRequiresPrice: "-", economicsRequiresPriceShort: "-",
  gridUnverifiedTitle: "", gridUnverifiedWarning: "",
} as unknown as ReportLabels;

const blob = generateReportBlob({ result, labels, locale: "sv-SE" });
blob.arrayBuffer().then((b) => writeFileSync("/dev-server/tmpqa/report.pdf", Buffer.from(b)));
