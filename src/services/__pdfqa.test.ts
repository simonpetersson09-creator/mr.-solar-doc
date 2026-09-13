import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";

import { generateReportBlob, type ReportLabels } from "./solar-report-service";
import { reportLanguage } from "./solar-report-service";
import i18n from "@/i18n";
import { calculateSolarSystem } from "@/lib/calc/engine";
import type { CalculationInput } from "@/lib/calc/types";
import { MARKETS } from "@/config/markets";

const MONTHLY = [22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5];

function makeInput(address: string): CalculationInput {
  const market = MARKETS["SE"]!;
  return {
    location: { address, latitude: 19.076, longitude: 72.8777, countryCode: "SE", region: "X" },
    resource: {
      annualKwhPerKwp: MONTHLY.reduce((a, b) => a + b, 0),
      monthlyKwhPerKwp: MONTHLY,
      orientation: "south",
      tiltDegrees: 30,
      orientationAssumed: false,
      tiltAssumed: false,
      dataSource: "PVGIS test",
      calculationDate: "2026-01-01",
    },
    consumption: { annualKwh: 18_000, monthlyKwh: null },
    electrical: { mainFuseAmp: 25, kwPerAmp: market.kwPerAmp },
    economics: { selfConsumedValuePerKwh: 1.44, exportValuePerKwh: 0.6, currency: "SEK" },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: market.inverterSizesKw,
  };
}

function labelsFor(language: string): ReportLabels {
  const rt = i18n.getFixedT(reportLanguage(language));
  return {
    title: rt("report.title"),
    appName: rt("app.name"),
    summary: rt("report.summary"),
    technical: rt("report.technical"),
    economicSummary: rt("report.economicSummary"),
    sizing: rt("report.sizing"),
    production: rt("report.production"),
    consumption: rt("report.consumption"),
    economics: rt("report.economics"),
    assumptions: rt("report.assumptions"),
    disclaimer: rt("report.disclaimer"),
    generated: rt("report.generated"),
    months: rt("months.short", { returnObjects: true }) as string[],
    rationale: rt("result.reason.profileNormal"),
    coverageNote: rt("result.coverageNote"),
    paybackNote: `${rt("result.paybackInfo")} ${rt("result.maxInvestmentNote")}`,
    quoteNote: rt("result.quoteNote"),
    shadingNote: rt("result.shadingNotIncludedNote"),
    clippingNote: rt("result.clippingNotModelledNote"),
    chartProduction: rt("report.chartProduction"),
    chartConsumption: rt("report.chartConsumption"),
    consumptionSource: rt("result.consumptionSource.annual-only"),
    origin: rt("report.origin", { returnObjects: true }) as ReportLabels["origin"],
    fields: rt("report.fields", { returnObjects: true }) as ReportLabels["fields"],
    economicsRequiresPrice: rt("result.economicsRequiresPrice"),
    economicsRequiresPriceShort: rt("result.economicsRequiresPriceShort"),
    gridUnverifiedTitle: rt("result.gridUnverifiedTitle"),
    gridUnverifiedWarning: rt("result.gridUnverifiedWarning"),
    installerChecklistTitle: rt("report.installerChecklistTitle"),
    installerChecklistItems: rt("report.installerChecklistItems", {
      returnObjects: true,
    }) as string[],
    faqTitle: rt("report.faqTitle"),
    faqItems: rt("report.faqItems", { returnObjects: true }) as ReportLabels["faqItems"],
  };
}

describe("PDF QA", () => {
  it("renders one saved calculation in every language", async () => {
    const result = calculateSolarSystem(makeInput("तिलक मार्ग, New Delhi, India"));
    mkdirSync("/tmp/pdfqa", { recursive: true });
    writeFileSync(
      "/tmp/pdfqa/totals.txt",
      `total=${result.lifetime.totalEconomicValue}\nrounded=${Math.round(result.lifetime.totalEconomicValue)}\n`,
    );
    for (const [language, locale] of [
      ["sv", "sv-SE"],
      ["el", "el-GR"],
      ["uk", "uk-UA"],
      ["hi", "hi-IN"],
      ["he", "he-IL"],
    ] as const) {
      const blob = await generateReportBlob({ result, labels: labelsFor(language), locale });
      writeFileSync(`/tmp/pdfqa/${language}.pdf`, Buffer.from(await blob.arrayBuffer()));
    }
    expect(true).toBe(true);
  }, 120_000);
});
