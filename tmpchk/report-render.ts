/** Temporary check: renders a real report PDF per language for visual QA. */
import { writeFileSync } from "node:fs";
import i18n from "../src/i18n";
import { calculateSolarSystem } from "../src/lib/calc/engine";
import { generateReportBlob, reportLanguage, type ReportLabels } from "../src/services/solar-report-service";

const result = calculateSolarSystem({
  location: { address: "Testgatan 1, Stockholm", latitude: 59.33, longitude: 18.06, countryCode: "SE", region: "Stockholm" },
  resource: { annualKwhPerKwp: 950, monthlyKwhPerKwp: [15, 35, 75, 110, 130, 135, 130, 110, 80, 45, 20, 10], orientation: "south", tiltDegrees: 30, orientationAssumed: false, tiltAssumed: false, dataSource: "PVGIS", calculationDate: "2026-09-01" },
  consumption: { annualKwh: 18000, monthlyKwh: Array.from({ length: 12 }, () => 1500), inputType: "monthly-manual" },
  electrical: { mainFuseAmp: 25, kwPerAmp: 0.69 },
  economics: { selfConsumedValuePerKwh: 1.44, exportValuePerKwh: 0.6, currency: "SEK" },
  selfConsumptionShare: 0.5,
  selfConsumptionShareIsUserSet: false,
  acceptedPaybackYears: 12,
  annualPriceChangeRate: 0.02,
  inverterSizesKw: [3, 5, 8, 10, 12, 15, 20],
} as never);

function labelsFor(language: string): ReportLabels {
  const t = i18n.getFixedT(language);
  const obj = (key: string) => t(key, { returnObjects: true }) as Record<string, string>;
  const proxy = (base: Record<string, unknown>, prefix: string) =>
    new Proxy(base, {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        const value = t(`${prefix}.${prop}`);
        return typeof value === "string" && value.startsWith(`${prefix}.`) ? `[${prop}]` : value;
      },
    });
  const base: Record<string, unknown> = {
    title: t("report.title"),
    appName: t("app.name"),
    months: t("months.short", { returnObjects: true }),
    origin: obj("report.origin"),
    fields: proxy(obj("report.fields"), "report.fields"),
    faqItems: t("report.faqItems", { returnObjects: true }),
    installerChecklistItems: t("report.installerChecklistItems", { returnObjects: true }),
    loadProfile: { label: t("result.loadProfileLabel"), value: t("result.loadProfile.mixed"), note: t("result.loadProfileNote") },
    selfConsumptionMode: { label: t("result.selfConsumptionModeLabel"), value: t("result.selfConsumptionModeAuto"), note: null },
    rationale: t("result.reason.profileNormal"),
    shadingNote: t("result.shadingNotIncludedNote"),
    clippingNote: t("result.clippingNotModelledNote"),
    disclaimer: t("report.disclaimer"),
  };
  return proxy(base, "report") as unknown as ReportLabels;
}

for (const [language, locale] of [["sv", "sv-SE"], ["en", "en-GB"], ["el", "el-GR"], ["uk", "uk-UA"], ["hi", "hi-IN"]]) {
  const blob = generateReportBlob({ result, labels: labelsFor(reportLanguage(language!)), locale: locale! } as never);
  const bytes = await blob.arrayBuffer();
  writeFileSync(`/tmp/report-${language}.pdf`, Buffer.from(bytes));
  console.log(language, "bytes", bytes.byteLength);
}
