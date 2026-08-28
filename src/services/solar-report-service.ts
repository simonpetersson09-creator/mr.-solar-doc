import { jsPDF } from "jspdf";
import type { CalculationResult, ValueOrigin } from "@/lib/calc/types";
import { formatCurrency, formatDecimal, formatNumber, isoDateOnly } from "@/lib/format";
import { shareFile } from "./native-service";

/**
 * Calculation Engine -> Calculation Result -> Report Service -> PDF.
 * This module presents finished results only; it contains no sizing logic.
 */

export type ReportFieldLabels = Record<string, string> & {
  array: string;
  inverter: string;
  installedDc: string;
  panelsUnit: string;
  dcAcRatio: string;
  oversizing: string;
  mainFuse: string;
  maxAc: string;
  annualProduction: string;
  specificYield: string;
  dataSource: string;
  address: string;
  coordinates: string;
  annualConsumption: string;
  selfConsumption: string;
  exported: string;
  assumedPrice: string;
  currency: string;
  economicValue: string;
  orientation: string;
  exactOrientation: string;
  coverage: string;
  savings: string;
  tilt: string;
  calculationVersion: string;
};

export interface ReportLabels {
  title: string;
  appName: string;
  summary: string;
  /** Section heading for the technical key figures cards. */
  technical: string;
  /** Section heading for the economic key figures cards. */
  economicSummary: string;
  sizing: string;
  production: string;
  consumption: string;
  economics: string;
  assumptions: string;
  disclaimer: string;
  generated: string;
  months: string[];
  /** Consumer-facing sentence explaining why the array ended up at this size. */
  rationale: string;
  coverageNote: string;
  /** Explains that the investment-level figure uses simple payback and is not a quote. */
  paybackNote: string;
  /** Explains that the quote comparison uses the same calculation assumptions. */
  quoteNote: string;
  chartProduction: string;
  chartConsumption: string;
  /** Where the consumption data came from (imported / entered / estimated). */
  consumptionSource: string;
  /** Chosen estimated profile, when the monthly data is estimated. */
  consumptionShape?: string | null;
  origin: Record<ValueOrigin, string>;
  fields: ReportFieldLabels;
}

export interface ReportOptions {
  result: CalculationResult;
  labels: ReportLabels;
  locale: string;
}

const PAGE = { width: 210, height: 297, margin: 18 };
const INK: [number, number, number] = [28, 46, 40];
const MUTED: [number, number, number] = [108, 122, 114];
const ACCENT: [number, number, number] = [232, 158, 54];
const LINE: [number, number, number] = [225, 226, 218];
const GREY: [number, number, number] = [163, 172, 166];

interface Row {
  label: string;
  value: string;
  origin?: ValueOrigin;
}

class ReportDocument {
  readonly doc: jsPDF;
  private y = PAGE.margin;

  constructor() {
    this.doc = new jsPDF({ unit: "mm", format: "a4" });
    this.doc.setFont("helvetica", "normal");
  }

  private ensureSpace(height: number) {
    if (this.y + height > PAGE.height - PAGE.margin) {
      this.doc.addPage();
      this.y = PAGE.margin;
    }
  }

  header(title: string, appName: string, subtitle: string, generated: string) {
    this.doc.setFillColor(...ACCENT);
    this.doc.rect(0, 0, PAGE.width, 30, "F");
    this.doc.setTextColor(...INK);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(18);
    this.doc.text(title, PAGE.margin, 15);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);
    this.doc.text(appName, PAGE.margin, 22);
    this.doc.text(generated, PAGE.width - PAGE.margin, 22, { align: "right" });

    // Address block sits below the band so it can never overlap the header text.
    this.y = 40;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.setTextColor(...INK);
    const lines = this.doc.splitTextToSize(subtitle, PAGE.width - PAGE.margin * 2) as string[];
    this.doc.text(lines, PAGE.margin, this.y);
    this.y += lines.length * 5 + 6;
  }

  pageBreak() {
    this.doc.addPage();
    this.y = PAGE.margin;
  }

  sectionTitle(text: string) {
    this.ensureSpace(16);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(12);
    this.doc.setTextColor(...INK);
    this.doc.text(text, PAGE.margin, this.y);
    this.y += 2.5;
    this.doc.setDrawColor(...ACCENT);
    this.doc.setLineWidth(0.8);
    this.doc.line(PAGE.margin, this.y, PAGE.margin + 22, this.y);
    this.y += 6;
  }

  highlights(items: Array<{ label: string; value: string }>) {
    const width = (PAGE.width - PAGE.margin * 2 - 8) / items.length;
    this.ensureSpace(30);
    items.forEach((item, index) => {
      const x = PAGE.margin + index * (width + 4);
      this.doc.setFillColor(250, 246, 236);
      this.doc.setDrawColor(...LINE);
      this.doc.setLineWidth(0.2);
      this.doc.roundedRect(x, this.y, width, 24, 2.5, 2.5, "FD");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...MUTED);
      this.doc.setFont("helvetica", "normal");
      this.doc.text(this.doc.splitTextToSize(item.label, width - 6), x + 3, this.y + 6);
      this.doc.setTextColor(...INK);
      this.doc.setFont("helvetica", "bold");
      let size = 14;
      this.doc.setFontSize(size);
      while (size > 7 && this.doc.getTextWidth(item.value) > width - 6) {
        size -= 0.5;
        this.doc.setFontSize(size);
      }
      this.doc.text(item.value, x + 3, this.y + 18);
    });
    this.y += 32;
  }

  rows(rows: Row[], originLabels?: Record<ValueOrigin, string>) {
    const full = PAGE.width - PAGE.margin * 2;
    rows.forEach((row, index) => {
      this.doc.setFontSize(9.5);
      this.doc.setFont("helvetica", "normal");
      const suffix = row.origin && originLabels ? `  (${originLabels[row.origin]})` : "";
      const labelWidth = this.doc.getTextWidth(row.label);
      this.doc.setFont("helvetica", "bold");
      const text = `${row.value}${suffix}`;
      const valueWidth = this.doc.getTextWidth(text);

      // Wrap onto a second line when label and value would collide.
      const stacked = labelWidth + valueWidth + 10 > full;
      const valueLines = stacked
        ? (this.doc.splitTextToSize(text, full - 4) as string[])
        : [text];
      const height = stacked ? 6 + valueLines.length * 5 : 8;
      this.ensureSpace(height + 1);

      if (index % 2 === 0) {
        this.doc.setFillColor(249, 249, 245);
        this.doc.rect(PAGE.margin, this.y - 4.5, full, height, "F");
      }
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(...MUTED);
      this.doc.text(row.label, PAGE.margin + 2, this.y);
      this.doc.setFont("helvetica", "bold");
      this.doc.setTextColor(...INK);
      if (stacked) {
        valueLines.forEach((line, lineIndex) => {
          this.doc.text(line, PAGE.width - PAGE.margin - 2, this.y + 5 + lineIndex * 5, {
            align: "right",
          });
        });
      } else {
        this.doc.text(text, PAGE.width - PAGE.margin - 2, this.y, { align: "right" });
      }
      this.y += height;
    });
    this.y += 4;
  }

  monthlyChart(
    values: number[],
    monthLabels: string[],
    locale: string,
    comparison?: number[] | null,
    legend?: { production: string; consumption: string },
  ) {
    const height = 42;
    this.ensureSpace(height + 20);
    const chartWidth = PAGE.width - PAGE.margin * 2;
    const max = Math.max(...values, ...(comparison ?? []), 1);
    const slot = chartWidth / 12;
    const paired = Boolean(comparison && comparison.length === 12);
    const barWidth = paired ? slot / 2 - 1.5 : slot - 3;
    const baseline = this.y + height;

    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.2);
    this.doc.line(PAGE.margin, baseline, PAGE.margin + chartWidth, baseline);

    values.forEach((value, index) => {
      const slotX = PAGE.margin + index * slot + 1.5;
      const draw = (amount: number, x: number, fill: [number, number, number]) => {
        const barHeight = (amount / max) * height;
        this.doc.setFillColor(...fill);
        this.doc.roundedRect(x, baseline - barHeight, barWidth, barHeight, 0.8, 0.8, "F");
        this.doc.setFontSize(5.5);
        this.doc.setTextColor(...MUTED);
        this.doc.text(
          formatNumber(Math.round(amount), locale).replace(/\s|\u00a0/g, ""),
          x + barWidth / 2,
          baseline - barHeight - 1.5,
          { align: "center" },
        );
      };
      draw(value, slotX, ACCENT);
      if (paired) draw(comparison![index] ?? 0, slotX + barWidth + 1.5, GREY);
      this.doc.setFontSize(6.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(monthLabels[index] ?? "", slotX + (paired ? slot / 2 - 1.5 : barWidth / 2), baseline + 4, {
        align: "center",
      });
    });
    this.y = baseline + 9;

    if (paired && legend) {
      const entries: Array<[string, [number, number, number]]> = [
        [legend.production, ACCENT],
        [legend.consumption, GREY],
      ];
      let x = PAGE.margin;
      this.doc.setFontSize(7.5);
      entries.forEach(([label, color]) => {
        this.doc.setFillColor(...color);
        this.doc.roundedRect(x, this.y - 2.4, 3, 3, 0.6, 0.6, "F");
        this.doc.setTextColor(...MUTED);
        this.doc.text(label, x + 4.5, this.y);
        x += 5 + this.doc.getTextWidth(label) + 8;
      });
      this.y += 6;
    }
    this.y += 4;
  }

  paragraph(text: string) {
    this.ensureSpace(14);
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(...MUTED);
    const lines = this.doc.splitTextToSize(text, PAGE.width - PAGE.margin * 2);
    this.doc.text(lines, PAGE.margin, this.y);
    this.y += lines.length * 4 + 4;
  }

  footer(appName: string) {
    const pages = this.doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      this.doc.setPage(page);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...MUTED);
      this.doc.text(appName, PAGE.margin, PAGE.height - 10);
      this.doc.text(`${page} / ${pages}`, PAGE.width - PAGE.margin, PAGE.height - 10, {
        align: "right",
      });
    }
  }
}

export function buildReportFileName(result: CalculationResult): string {
  return `mr-solar-doc-${isoDateOnly(result.calculatedAt)}.pdf`;
}

/** 30-year value: full output through year 20, then 90 % efficiency for years 21-30. */
function thirtyYearSavings(annualSavings: number): number {
  return Math.round(annualSavings * (20 + 10 * 0.9));
}

export function generateReportBlob(options: ReportOptions): Blob {
  const { result, labels, locale } = options;
  const f = labels.fields;
  const currency = result.economics.currency;
  const report = new ReportDocument();

  report.header(
    labels.title,
    labels.appName,
    result.location.address,
    `${labels.generated}: ${isoDateOnly(result.calculatedAt)}`,
  );

  report.sectionTitle(labels.summary);
  report.highlights([
    { label: f.array, value: `${formatDecimal(result.installedKwp, locale)} kWp (${result.panelCount} ${f["panelsUnit"]})` },
    { label: f.inverter, value: `${formatNumber(result.inverterKw, locale)} kW` },
    {
      label: f.annualProduction,
      value: `${formatNumber(result.presentation.annualProductionKwh, locale)} kWh`,
    },
    {
      label: f.savings,
      value: formatCurrency(result.presentation.annualSavings, locale, currency),
    },
  ]);
  report.rows(
    [
      {
        label: f.coverage,
        value: `${formatNumber(result.presentation.productionCoveragePercent, locale)} %`,
        origin: "calculated",
      },
    ],
    labels.origin,
  );
  report.paragraph(`${labels.rationale} ${labels.coverageNote}`);
  report.rows(
    [
      { label: f.address, value: result.location.address, origin: "user" },
      {
        label: f.specificYield,
        value: `${formatNumber(result.resource.annualKwhPerKwp, locale)} kWh/kWp`,
        origin: "external",
      },
    ],
    labels.origin,
  );

  report.sectionTitle(labels.sizing);
  report.rows(
    [
      {
        label: f.installedDc,
        value: `${formatDecimal(result.installedKwp, locale)} kWp (${result.panelCount} ${f["panelsUnit"]})`,
        origin: "calculated",
      },
      {
        label: f.inverter,
        value: `${formatNumber(result.inverterKw, locale)} kW`,
        origin: "calculated",
      },
      {
        label: f.dcAcRatio,
        value: formatDecimal(result.dcAcRatio, locale, 2),
        origin: "calculated",
      },
      {
        label: f.oversizing,
        value: `${formatDecimal(result.oversizingPercent, locale)} %`,
        origin: "calculated",
      },
      { label: f.mainFuse, value: `${result.mainFuseAmp} A`, origin: "user" },
      {
        label: f.maxAc,
        value: `${formatDecimal(result.presentation.maxAcPowerKw, locale, 1)} kW`,
        origin: "calculated",
      },
    ],
    labels.origin,
  );

  report.sectionTitle(labels.production);
  report.rows(
    [
      {
        label: f.annualProduction,
        value: `${formatNumber(result.presentation.annualProductionKwh, locale)} kWh`,
        origin: "calculated",
      },
      { label: f.dataSource, value: result.resource.dataSource, origin: "external" },
    ],
    labels.origin,
  );
  report.monthlyChart(
    result.monthlyProductionKwh,
    labels.months,
    locale,
    result.consumption.monthlyKwh,
    { production: labels.chartProduction, consumption: labels.chartConsumption },
  );

  report.sectionTitle(labels.consumption);
  const consumptionRows: Row[] = [
    {
      label: f.annualConsumption,
      value: `${formatNumber(result.presentation.annualConsumptionKwh, locale)} kWh`,
      origin: "user",
    },
    {
      label: f.selfConsumption,
      value: `${formatNumber(result.presentation.selfConsumptionPercent, locale)} % · ${formatNumber(result.presentation.selfConsumptionKwh, locale)} kWh`,
      origin: "assumed",
    },
    {
      label: f.exported,
      value: `${formatNumber(result.presentation.exportPercent, locale)} % · ${formatNumber(result.presentation.exportedKwh, locale)} kWh`,
      origin: "assumed",
    },
  ];
  consumptionRows.splice(1, 0, {
    label: f["consumptionSource"] ?? f.dataSource,
    value: labels.consumptionSource,
    origin: result.consumption.isEstimated ? "assumed" : "user",
  });
  if (labels.consumptionShape) {
    consumptionRows.splice(2, 0, {
      label: f["consumptionShape"] ?? f.dataSource,
      value: labels.consumptionShape,
      origin: "user",
    });
  }
  if (result.consumption.monthlyKwh) {
    result.consumption.monthlyKwh.forEach((value, index) => {
      consumptionRows.push({
        label: labels.months[index] ?? "",
        value: `${formatNumber(value, locale)} kWh`,
        origin: result.consumption.isEstimated ? "assumed" : "user",
      });
    });
  }
  report.rows(consumptionRows, labels.origin);

  report.sectionTitle(labels.economics);
  report.rows(
    [
      {
        label: f["selfConsumedValueRate"] ?? f.assumedPrice,
        value: `${formatDecimal(result.economics.selfConsumedValuePerKwh, locale, 2)} ${currency}/kWh`,
        origin: "assumed",
      },
      {
        label: f["exportValueRate"] ?? f.assumedPrice,
        value: `${formatDecimal(result.economics.exportValuePerKwh, locale, 2)} ${currency}/kWh`,
        origin: "assumed",
      },
      { label: f.currency, value: currency, origin: "assumed" },
      {
        label: f["selfConsumptionValue"] ?? f.selfConsumption,
        value: formatCurrency(result.presentation.selfConsumptionValue, locale, currency),
        origin: "calculated",
      },
      {
        label: f["exportValue"] ?? f.exported,
        value: formatCurrency(result.presentation.exportValue, locale, currency),
        origin: "calculated",
      },
      {
        label: f["totalAnnualBenefit"] ?? f.economicValue,
        value: formatCurrency(result.presentation.annualSavings, locale, currency),
        origin: "calculated",
      },
    ],
    labels.origin,
  );

  report.rows(
    [
      {
        label: f["acceptedPayback"] ?? "",
        value: `${formatNumber(result.investment.acceptedPaybackYears, locale)} ${f["yearsUnit"] ?? ""}`,
        origin: "user",
      },
      {
        label: f["maxInvestment"] ?? "",
        value: formatCurrency(result.investment.maxInvestmentRounded, locale, currency),
        origin: "calculated",
      },
    ],
    labels.origin,
  );
  if (result.investment.quotePrice != null) {
    report.rows(
      [
        {
          label: f["quotePrice"] ?? "",
          value: formatCurrency(result.investment.quotePrice, locale, currency),
          origin: "user",
        },
        {
          label: f["quotePayback"] ?? "",
          value:
            result.investment.quotePaybackYears != null
              ? `${formatDecimal(result.investment.quotePaybackYears, locale, 1)} ${f["yearsUnit"] ?? ""}`
              : "-",
          origin: "calculated",
        },
      ],
      labels.origin,
    );
  }
  report.paragraph(
    result.investment.quotePrice != null
      ? `${labels.paybackNote} ${labels.quoteNote}`
      : labels.paybackNote,
  );

  report.sectionTitle(labels.assumptions);
  const assumptionRows: Row[] = [
    {
      label: f.orientation,
      value: f[`orientation_${result.resource.orientation}`] ?? result.resource.orientation,
      origin: result.resource.orientationAssumed ? "assumed" : "user",
    },
    ...(result.resource.azimuthDegrees != null
      ? [
          {
            label: f.exactOrientation,
            value: `${formatNumber(result.resource.azimuthDegrees, locale)}°`,
            origin: "user" as ValueOrigin,
          },
        ]
      : []),
    {
      label: f.tilt,
      value:
        result.resource.tiltDegrees !== null
          ? `${formatNumber(result.resource.tiltDegrees, locale)}°`
          : "-",
      origin: result.resource.tiltAssumed ? "assumed" : "user",
    },
    {
      label: f.coordinates,
      value: `${result.location.latitude.toFixed(5)}, ${result.location.longitude.toFixed(5)}`,
      origin: "user",
    },
    { label: f.dataSource, value: result.resource.dataSource, origin: "external" },
    { label: f.calculationVersion, value: result.calculationVersion, origin: "calculated" },
  ];
  report.rows(assumptionRows, labels.origin);
  report.paragraph(labels.disclaimer);
  report.footer(labels.appName);

  return report.doc.output("blob");
}

/** Generate and hand off to the native share sheet, or download in the browser. */
export async function exportReport(options: ReportOptions): Promise<"shared" | "downloaded"> {
  const blob = generateReportBlob(options);
  return shareFile({
    blob,
    fileName: buildReportFileName(options.result),
    mimeType: "application/pdf",
    title: options.labels.title,
  });
}
