import { calculateSolarSystem } from "@/lib/calc/engine";
import { generateReportBlob } from "@/services/solar-report-service";
import type { ReportLabels } from "@/services/solar-report-service";
import { sv } from "@/i18n/locales/sv";
import { getMarketConfig } from "@/config/markets";
import { writeFileSync } from "node:fs";

const market = getMarketConfig("SE");

const input = {
  location: {
    address: "Storgatan 1, Uppsala",
    latitude: 59.86,
    longitude: 17.64,
    countryCode: "SE",
    region: "Uppsala",
  },
  resource: {
    annualKwhPerKwp: 950,
    monthlyKwhPerKwp: [20, 45, 80, 110, 120, 115, 110, 100, 75, 45, 20, 12],
    orientation: "south",
    tiltDegrees: 30,
    azimuthDegrees: 180,
    orientationAssumed: false,
    tiltAssumed: false,
    dataSource: "PVGIS SARAH3",
    calculationDate: "2026-08-31",
  },
  consumption: {
    annualKwh: 12000,
    monthlyKwh: null,
    inputType: "annual-only",
    shape: null,
    isEstimated: false,
  },
  electrical: {
    mainFuseAmp: 16,
    kwPerAmp: market.kwPerAmp,
    gridVoltageV: market.gridVoltageV,
    gridPhases: market.gridPhases,
  },
  economics: {
    selfConsumedValuePerKwh: market.selfConsumedElectricityValue ?? 1.2,
    exportValuePerKwh: market.exportElectricityValue ?? 0.7,
    currency: market.currency,
  },
  selfConsumptionShare: 0.5,
  acceptedPaybackYears: 12,
  inverterSizesKw: [3, 4, 5, 6, 7, 8, 10, 12],
} as Parameters<typeof calculateSolarSystem>[0];

const result = calculateSolarSystem(input);

const labels = {
  title: sv.report.title,
  appName: sv.app.name,
  summary: sv.report.summary,
  technical: sv.report.technical,
  economicSummary: sv.report.economicSummary,
  sizing: sv.report.sizing,
  production: sv.report.production,
  consumption: sv.report.consumption,
  economics: sv.report.economics,
  assumptions: sv.report.assumptions,
  disclaimer: sv.report.disclaimer,
  generated: sv.report.generated,
  months: sv.months.short,
  rationale: "Anläggningen dimensioneras utifrån din elförbrukning.",
  coverageNote: "",
  paybackNote: "",
  quoteNote: "",
  consumptionSource: "Årsförbrukning",
  consumptionShape: null,
  chartProduction: sv.report.chartProduction,
  chartConsumption: sv.report.chartConsumption,
  origin: sv.report.origin,
  fields: sv.report.fields,
  faqTitle: sv.report.faqTitle,
  faqItems: sv.report.faqItems,
} as unknown as ReportLabels;

const blob = generateReportBlob({ result, labels, locale: "sv-SE" });
const buffer = Buffer.from(await blob.arrayBuffer());
writeFileSync("/tmp/browser/faq/report.pdf", buffer);
console.log("PDF bytes:", buffer.length, "| pages:", (buffer.length > 0 ? "written" : "empty"));