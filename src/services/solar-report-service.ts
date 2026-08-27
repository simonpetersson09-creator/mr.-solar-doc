import { jsPDF } from "jspdf";
import type { CalculationResult, ValueOrigin } from "@/lib/calc/types";
import { PANEL_WATTAGE_KWP } from "@/config/constants";
import { formatCurrency, formatDecimal, formatNumber, formatPercent, isoDateOnly } from "@/lib/format";
import { shareFile } from "./native-service";

/** Estimated number of panels for a given installed DC power. */
function panelCount(installedKwp: number): number {
  return Math.max(1, Math.round(installedKwp / PANEL_WATTAGE_KWP));
}

/**
 * Calculation Engine -> Calculation Result -> Report Service -> PDF.
 * This module presents finished results only; it contains no sizing logic.
 */

export type ReportFieldLabels = Record<string, string> & {
  array: string;
  inverter: string;
  installedDc: string;
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
  tilt: string;
  calculationVersion: string;
};

export interface ReportLabels {
  title: string;
  appName: string;
  summary: string;
  sizing: string;
  production: string;
  consumption: string;
  economics: string;
  assumptions: string;
  disclaimer: string;
  generated: string;
  months: string[];
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
    this.doc.rect(0, 0, PAGE.width, 34, "F");
    this.doc.setTextColor(...INK);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(20);
    this.doc.text(title, PAGE.margin, 16);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10);
    this.doc.text(appName, PAGE.margin, 23);
    this.doc.text(generated, PAGE.width - PAGE.margin, 23, { align: "right" });
    this.y = 44;
    this.doc.setFontSize(11);
    this.doc.setTextColor(...MUTED);
    const lines = this.doc.splitTextToSize(subtitle, PAGE.width - PAGE.margin * 2);
    this.doc.text(lines, PAGE.margin, this.y);
    this.y += lines.length * 5 + 4;
  }

  sectionTitle(text: string) {
    this.ensureSpace(16);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(13);
    this.doc.setTextColor(...INK);
    this.doc.text(text, PAGE.margin, this.y);
    this.y += 3;
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
      this.doc.setFontSize(14);
      this.doc.setTextColor(...INK);
      this.doc.setFont("helvetica", "bold");
      this.doc.text(item.value, x + 3, this.y + 18);
    });
    this.y += 32;
  }

  rows(rows: Row[], originLabels?: Record<ValueOrigin, string>) {
    this.doc.setFontSize(10);
    rows.forEach((row, index) => {
      this.ensureSpace(9);
      if (index % 2 === 0) {
        this.doc.setFillColor(249, 249, 245);
        this.doc.rect(PAGE.margin, this.y - 4.5, PAGE.width - PAGE.margin * 2, 8, "F");
      }
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(...MUTED);
      this.doc.text(row.label, PAGE.margin + 2, this.y);
      this.doc.setFont("helvetica", "bold");
      this.doc.setTextColor(...INK);
      const suffix =
        row.origin && originLabels ? `   (${originLabels[row.origin]})` : "";
      this.doc.text(`${row.value}${suffix}`, PAGE.width - PAGE.margin - 2, this.y, {
        align: "right",
      });
      this.y += 8;
    });
    this.y += 4;
  }

  monthlyChart(values: number[], monthLabels: string[], locale: string) {
    const height = 42;
    this.ensureSpace(height + 14);
    const chartWidth = PAGE.width - PAGE.margin * 2;
    const max = Math.max(...values, 1);
    const barWidth = chartWidth / 12 - 3;
    const baseline = this.y + height;

    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.2);
    this.doc.line(PAGE.margin, baseline, PAGE.margin + chartWidth, baseline);

    values.forEach((value, index) => {
      const barHeight = (value / max) * height;
      const x = PAGE.margin + index * (chartWidth / 12) + 1.5;
      this.doc.setFillColor(...ACCENT);
      this.doc.roundedRect(x, baseline - barHeight, barWidth, barHeight, 0.8, 0.8, "F");
      this.doc.setFontSize(6.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(monthLabels[index] ?? "", x + barWidth / 2, baseline + 4, { align: "center" });
      this.doc.setFontSize(6);
      this.doc.text(
        formatNumber(value, locale),
        x + barWidth / 2,
        baseline - barHeight - 1.5,
        { align: "center" },
      );
    });
    this.y = baseline + 12;
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
  return `solenergikollen-${isoDateOnly(result.calculatedAt)}.pdf`;
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
    { label: f.array, value: `${formatDecimal(result.installedKwp, locale)} kWp (${panelCount(result.installedKwp)} ${f.panelsUnit ?? "panels"})` },
    { label: f.inverter, value: `${formatNumber(result.inverterKw, locale)} kW` },
    {
      label: f.annualProduction,
      value: `${formatNumber(result.annualProductionKwh, locale)} kWh`,
    },
  ]);
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
        value: `${formatDecimal(result.installedKwp, locale)} kWp (${panelCount(result.installedKwp)} ${f.panelsUnit ?? "panels"})`,
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
        value: `${formatDecimal(result.maxAcPowerKw, locale, 2)} kW`,
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
        value: `${formatNumber(result.annualProductionKwh, locale)} kWh`,
        origin: "calculated",
      },
      { label: f.dataSource, value: result.resource.dataSource, origin: "external" },
    ],
    labels.origin,
  );
  report.monthlyChart(result.monthlyProductionKwh, labels.months, locale);

  report.sectionTitle(labels.consumption);
  const consumptionRows: Row[] = [
    {
      label: f.annualConsumption,
      value: `${formatNumber(result.consumption.annualKwh, locale)} kWh`,
      origin: "user",
    },
    {
      label: f.selfConsumption,
      value: `${formatPercent(result.selfConsumption.share, locale)} · ${formatNumber(result.selfConsumption.kwh, locale)} kWh`,
      origin: "assumed",
    },
    {
      label: f.exported,
      value: `${formatPercent(result.exported.share, locale)} · ${formatNumber(result.exported.kwh, locale)} kWh`,
      origin: "assumed",
    },
  ];
  if (result.consumption.monthlyKwh) {
    result.consumption.monthlyKwh.forEach((value, index) => {
      consumptionRows.push({
        label: labels.months[index] ?? "",
        value: `${formatNumber(value, locale)} kWh`,
        origin: "user",
      });
    });
  }
  report.rows(consumptionRows, labels.origin);

  report.sectionTitle(labels.economics);
  report.rows(
    [
      {
        label: f.assumedPrice,
        value: `${formatDecimal(result.economics.electricityPricePerKwh, locale, 2)} ${currency}/kWh`,
        origin: "assumed",
      },
      { label: f.currency, value: currency, origin: "assumed" },
      {
        label: f.economicValue,
        value: formatCurrency(result.economics.totalValue, locale, currency),
        origin: "calculated",
      },
    ],
    labels.origin,
  );

  report.sectionTitle(labels.assumptions);
  const assumptionRows: Row[] = [
    {
      label: f.orientation,
      value: f[`orientation_${result.resource.orientation}`] ?? result.resource.orientation,
      origin: result.resource.orientationAssumed ? "assumed" : "user",
    },
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
