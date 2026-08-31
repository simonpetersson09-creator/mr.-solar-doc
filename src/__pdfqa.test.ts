import { it } from "vitest";
import { writeFileSync } from "fs";
import { calculateSolarSystem } from "@/lib/calc/engine";
import { MARKETS } from "@/config/markets";
import { generateReportBlob, type ReportLabels } from "@/services/solar-report-service";
import i18n from "@/i18n";

const M = [22,45,90,121,140,137,133,111,74,41,19,5];
it("makes a pdf", async () => {
  const market = MARKETS["SE"]!;
  const result = calculateSolarSystem({
    location: { address: "Testgatan 1, Stockholm", latitude: 59.33, longitude: 18.07, countryCode: "SE", region: "Stockholm" },
    resource: { annualKwhPerKwp: M.reduce((a,b)=>a+b,0), monthlyKwhPerKwp: M, orientation: "south", tiltDegrees: 30, orientationAssumed: false, tiltAssumed: false, dataSource: "PVGIS-SARAH3", calculationDate: "2026-01-01" },
    consumption: { annualKwh: 12000, monthlyKwh: null },
    electrical: { mainFuseAmp: 25, kwPerAmp: market.kwPerAmp },
    economics: { selfConsumedValuePerKwh: 1.5, exportValuePerKwh: 0.6, currency: "SEK" },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    annualPriceChangeRate: 0.04,
    inverterSizesKw: market.inverterSizesKw,
  } as never);
  await i18n.changeLanguage("sv");
  const t = i18n.t.bind(i18n);
  const labels: ReportLabels = {
    title: t("report.title"), appName: t("app.name"), summary: t("report.summary"), technical: t("report.technical"),
    economicSummary: t("report.economicSummary"), sizing: t("report.sizing"), production: t("report.production"),
    consumption: t("report.consumption"), economics: t("report.economics"), assumptions: t("report.assumptions"),
    disclaimer: t("report.disclaimer"), generated: t("report.generated"),
    months: i18n.t("months.short", { returnObjects: true }) as string[],
    rationale: t("result.reason.profileNormal"), coverageNote: t("result.coverageNote"),
    paybackNote: `${t("result.paybackInfo")} ${t("result.maxInvestmentNote")}`, quoteNote: t("result.quoteNote"),
    consumptionSource: t("result.consumptionSource.annual-only"), consumptionShape: null,
    chartProduction: t("report.chartProduction"), chartConsumption: t("report.chartConsumption"),
    origin: i18n.t("report.origin", { returnObjects: true }) as ReportLabels["origin"],
    fields: i18n.t("report.fields", { returnObjects: true }) as ReportLabels["fields"],
    economicsRequiresPrice: t("result.economicsRequiresPrice"), economicsRequiresPriceShort: t("result.economicsRequiresPriceShort"),
    gridUnverifiedTitle: t("result.gridUnverifiedTitle"), gridUnverifiedWarning: t("result.gridUnverifiedWarning"),
    faqTitle: t("report.faqTitle"), faqItems: i18n.t("report.faqItems", { returnObjects: true }) as ReportLabels["faqItems"],
  } as ReportLabels;
  const blob = generateReportBlob({ result, labels, locale: "sv-SE" });
  writeFileSync("/tmp/pdfqa/report.pdf", Buffer.from(await blob.arrayBuffer()));
});
