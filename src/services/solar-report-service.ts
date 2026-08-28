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

/**
 * jsPDF's core fonts are WinAnsi-encoded: they lack U+2212, thin spaces and the
 * Central/Eastern European letters used by currency symbols ("zł") and by the
 * Polish/Czech/Slovak/Slovenian/Baltic translations. Normalise before drawing so
 * the right currency and text always render instead of stray glyphs.
 */
const WINANSI_FALLBACK: Record<string, string> = {
  ł: "l",
  Ł: "L",
  č: "c",
  Č: "C",
  ć: "c",
  Ć: "C",
  ě: "e",
  Ě: "E",
  ę: "e",
  Ę: "E",
  ą: "a",
  Ą: "A",
  ś: "s",
  Ś: "S",
  š: "s",
  Š: "S",
  ż: "z",
  Ż: "Z",
  ź: "z",
  Ź: "Z",
  ž: "z",
  Ž: "Z",
  ń: "n",
  Ń: "N",
  ň: "n",
  Ň: "N",
  ř: "r",
  Ř: "R",
  ť: "t",
  Ť: "T",
  ď: "d",
  Ď: "D",
  ů: "u",
  Ů: "U",
  ű: "u",
  Ű: "U",
  ő: "o",
  Ő: "O",
  ā: "a",
  Ā: "A",
  ē: "e",
  Ē: "E",
  ī: "i",
  Ī: "I",
  ū: "u",
  Ū: "U",
  ģ: "g",
  Ģ: "G",
  ķ: "k",
  Ķ: "K",
  ļ: "l",
  Ļ: "L",
  ņ: "n",
  Ņ: "N",
  ė: "e",
  Ė: "E",
  į: "i",
  Į: "I",
  ų: "u",
  Ų: "U",
  đ: "d",
  Đ: "D",
  ŕ: "r",
  Ŕ: "R",
  ĺ: "l",
  Ĺ: "L",
  ľ: "l",
  Ľ: "L",
};

export function pdfText(value: string): string {
  return value
    .replace(/\u2212/g, "-")
    .replace(/[\u202f\u2009]/g, "\u00a0")
    .replace(/[^\u0000-\u00ff]/g, (char) => WINANSI_FALLBACK[char] ?? char);
}


class ReportDocument {
  readonly doc: jsPDF;
  private y = PAGE.margin;

  constructor() {
    this.doc = new jsPDF({ unit: "mm", format: "a4" });
    // Central text sanitation: core PDF fonts lack a few Unicode glyphs.
    const drawText = this.doc.text.bind(this.doc);
    (this.doc as unknown as { text: unknown }).text = ((value: unknown, ...rest: unknown[]) =>
      (drawText as (...args: unknown[]) => unknown)(
        Array.isArray(value) ? value.map((line) => pdfText(String(line))) : pdfText(String(value)),
        ...rest,
      )) as unknown as jsPDF["text"];
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
    this.y += lines.length * 5 + 10;
  }

  pageBreak() {
    this.doc.addPage();
    this.y = PAGE.margin;
  }

  sectionTitle(text: string) {
    this.ensureSpace(18);
    this.y += 2;
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

  /** Bordered note block, used for the closing "what can affect the outcome" text. */
  noteBox(title: string, text: string) {
    const width = PAGE.width - PAGE.margin * 2;
    this.doc.setFontSize(8.5);
    this.doc.setFont("helvetica", "normal");
    const lines = this.doc.splitTextToSize(text, width - 8) as string[];
    const height = 12 + lines.length * 4;
    this.ensureSpace(height + 4);
    this.doc.setFillColor(250, 246, 236);
    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.2);
    this.doc.roundedRect(PAGE.margin, this.y, width, height, 2.5, 2.5, "FD");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...INK);
    this.doc.text(title, PAGE.margin + 4, this.y + 6);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(...MUTED);
    this.doc.text(lines, PAGE.margin + 4, this.y + 11);
    this.y += height + 6;
  }

  /**
   * Compact cumulative-value line chart for the calculation period.
   * Presentation only — every point comes from the calculation result.
   */
  cumulativeChart(
    points: Array<{ year: number; value: number }>,
    markers: number[],
    formatValue: (value: number) => string,
    axisLabel: string,
  ) {
    const height = 32;
    this.ensureSpace(height + 24);
    const width = PAGE.width - PAGE.margin * 2;
    const baseline = this.y + height;
    const maxValue = Math.max(...points.map((p) => p.value), 1);
    const maxYear = Math.max(...points.map((p) => p.year), 1);
    const xFor = (year: number) => PAGE.margin + ((year - 1) / (maxYear - 1 || 1)) * width;
    const yFor = (value: number) => baseline - (value / maxValue) * height;

    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.2);
    this.doc.line(PAGE.margin, baseline, PAGE.margin + width, baseline);

    this.doc.setDrawColor(...ACCENT);
    this.doc.setLineWidth(0.7);
    points.forEach((point, index) => {
      if (index === 0) return;
      const previous = points[index - 1]!;
      this.doc.line(xFor(previous.year), yFor(previous.value), xFor(point.year), yFor(point.value));
    });

    this.doc.setFontSize(6.5);
    markers.forEach((year) => {
      const point = points.find((p) => p.year === year);
      if (!point) return;
      const x = xFor(point.year);
      const y = yFor(point.value);
      this.doc.setFillColor(...ACCENT);
      this.doc.circle(x, y, 0.9, "F");
      this.doc.setTextColor(...INK);
      const align = year === maxYear ? "right" : year === 1 ? "left" : "center";
      this.doc.text(formatValue(point.value), x, y - 2.5, { align });
      this.doc.setTextColor(...MUTED);
      this.doc.text(`${axisLabel} ${year}`, x, baseline + 4, { align });
    });
    this.y = baseline + 10;
  }

  footer(appName: string, reportId?: string) {
    const pages = this.doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      this.doc.setPage(page);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...MUTED);
      this.doc.text(appName, PAGE.margin, PAGE.height - 10);
      if (reportId) {
        this.doc.text(reportId, PAGE.width / 2, PAGE.height - 10, { align: "center" });
      }
      this.doc.text(`${page} / ${pages}`, PAGE.width - PAGE.margin, PAGE.height - 10, {
        align: "right",
      });
    }
  }
}

/** Unique, human-readable identifier for one generated report. */
export function buildReportId(result: CalculationResult): string {
  const date = isoDateOnly(result.calculatedAt).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, "0");
  return `MSD-${date}-${random}`;
}


export function buildReportFileName(result: CalculationResult): string {
  return `mr-solar-doc-${isoDateOnly(result.calculatedAt)}.pdf`;
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

  report.sectionTitle(labels.technical);
  report.highlights([
    {
      label: f["panelPower"] ?? f.installedDc,
      value: `${formatDecimal(result.installedKwp, locale)} kWp (${result.panelCount} ${f["panelsUnit"]})`,
    },
    { label: f.inverter, value: `${formatNumber(result.inverterKw, locale)} kW` },
    {
      label: f.annualProduction,
      value: `${formatNumber(result.presentation.annualProductionKwh, locale)} kWh`,
    },
  ]);

  // Annual balance: production vs consumption, from the same presentation values
  // used by the results page and the monthly chart.
  const consumptionKwh = result.presentation.annualConsumptionKwh;
  const productionKwh = result.presentation.annualProductionKwh;
  const balanceKwh = productionKwh - consumptionKwh;
  const ratioPercent = result.presentation.productionCoveragePercent;
  report.sectionTitle(f["balanceTitle"] ?? "");
  report.highlights([
    {
      label: f["balanceConsumption"] ?? f.annualConsumption,
      value: `${formatNumber(consumptionKwh, locale)} kWh`,
    },
    {
      label: f["balanceProduction"] ?? f.annualProduction,
      value: `${formatNumber(productionKwh, locale)} kWh`,
    },
    {
      label: f["balanceDiff"] ?? "",
      value: `${balanceKwh > 0 ? "+" : ""}${formatNumber(balanceKwh, locale)} kWh`,
    },
    {
      label: f["balanceRatio"] ?? "",
      value: `${formatNumber(ratioPercent, locale)} %`,
    },
  ]);
  report.paragraph(
    (f["balanceNote"] ?? "").replace("{{percent}}", formatNumber(ratioPercent, locale)),
  );

  const investmentValue = result.investment.quotePrice ?? result.investment.maxInvestmentRounded;
  const paybackValue =
    result.investment.quotePaybackYears ?? result.investment.acceptedPaybackYears;
  report.sectionTitle(labels.economicSummary);
  report.highlights([
    {
      label: f["annualValue"] ?? f.savings,
      value: formatCurrency(result.presentation.annualSavings, locale, currency),
    },
    {
      label: f["investment"] ?? f["maxInvestment"] ?? "",
      value: formatCurrency(investmentValue, locale, currency),
    },
    {
      label: f["paybackTime"] ?? f["acceptedPayback"] ?? "",
      value: `${formatDecimal(paybackValue, locale, 1)} ${f["yearsUnit"] ?? ""}`,
    },
    {
      label: (f["savings30"] ?? f.savings).replace(
        "{{years}}",
        String(result.lifetime.periodYears),
      ),
      value: formatCurrency(
        Math.round(result.lifetime.totalEconomicValue),
        locale,
        currency,
      ),
    },
  ]);

  // Page 1 keeps only the short method line; the full explanation lives on the
  // economics page so the summary stays readable.
  report.paragraph(
    (f["savings30Short"] ?? "").replace(
      "{{degradation}}",
      formatDecimal(result.lifetime.annualDegradationRate * 100, locale, 1),
    ),
  );

  report.pageBreak();

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
        label: f["gridConnection"] ?? "",
        value: (f["gridConnectionValue"] ?? "{{voltage}} V, {{phases}}")
          .replace("{{voltage}}", formatNumber(result.grid.voltageV, locale))
          .replace("{{phases}}", String(result.grid.phases)),
        origin: "assumed",
      },
      {
        label: f.maxAc,
        value: `${formatDecimal(result.presentation.maxAcPowerKw, locale, 1)} kW`,
        origin: "calculated",
      },
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
    ],
    labels.origin,
  );

  report.pageBreak();
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
  report.rows(consumptionRows, labels.origin);

  // "Your solar electricity": self-consumption rate vs self-sufficiency rate.
  // Both come straight from the calculation result and are never mixed up.
  const selfConsumptionOrigin: ValueOrigin =
    result.selfConsumptionSource === "standard-assumption"
      ? "assumed"
      : result.selfConsumptionSource === "user-override"
        ? "user"
        : "calculated";
  report.sectionTitle(f["solarShareTitle"] ?? f.selfConsumption);
  report.rows(
    [
      {
        label: f["selfConsumptionRate"] ?? f.selfConsumption,
        value: `${formatNumber(result.presentation.selfConsumptionPercent, locale)} %`,
        origin: selfConsumptionOrigin,
      },
      {
        label: f.selfConsumption,
        value: `${formatNumber(result.presentation.selfConsumptionKwh, locale)} kWh`,
        origin: selfConsumptionOrigin,
      },
      {
        label: f.exported,
        value: `${formatNumber(result.presentation.exportedKwh, locale)} kWh`,
        origin: selfConsumptionOrigin,
      },
      {
        label: f["selfSufficiencyRate"] ?? "",
        value: `${formatNumber(Math.round(result.selfSufficiencyRate * 100), locale)} %`,
        origin: selfConsumptionOrigin,
      },
    ],
    labels.origin,
  );
  report.paragraph(
    `${f["selfConsumptionRateNote"] ?? ""} ${f["selfSufficiencyRateNote"] ?? ""}`,
  );

  report.pageBreak();
  report.sectionTitle(labels.economics);
  report.rows(
    [
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

  // Cumulative economic value over the calculation period, straight from
  // result.lifetime (0.5 %/year degradation, unchanged electricity values).
  let running = 0;
  const cumulative = result.lifetime.years.map((year) => {
    running += year.economicValue;
    return { year: year.year, value: running };
  });
  const markerYears = [1, 10, 20, result.lifetime.periodYears].filter(
    (year, index, all) => year <= result.lifetime.periodYears && all.indexOf(year) === index,
  );
  report.sectionTitle(f["longTermChartTitle"] ?? "");
  report.cumulativeChart(
    cumulative,
    markerYears,
    (value) => formatCurrency(Math.round(value), locale, currency),
    f["yearShort"] ?? "",
  );
  report.paragraph(
    `${(f["savings30Note"] ?? "").replace(
      "{{degradation}}",
      formatDecimal(result.lifetime.annualDegradationRate * 100, locale, 1),
    )} ${(f["savings30Method"] ?? "")
      .replace("{{years}}", String(result.lifetime.periodYears))
      .replace(
        "{{degradation}}",
        formatDecimal(result.lifetime.annualDegradationRate * 100, locale, 1),
      )
      .replace(
        "{{priceChange}}",
        formatDecimal(result.lifetime.annualPriceChangeRate * 100, locale, 0),
      )}`,
  );

  report.sectionTitle(f["keyAssumptions"] ?? labels.assumptions);
  const selfConsumptionSourceLabel =
    f[`selfConsumptionSource_${result.selfConsumptionSource}`] ?? "";
  const assumptionRows: Row[] = [
    {
      label: f.specificYield,
      value: `${formatNumber(result.resource.annualKwhPerKwp, locale)} kWh/kWp`,
      origin: "external",
    },
    {
      label: f["selfConsumptionShare"] ?? f.selfConsumption,
      value: `${formatNumber(result.presentation.selfConsumptionPercent, locale)} % – ${selfConsumptionSourceLabel}`,
      origin: selfConsumptionOrigin,
    },
    {
      label: f["selfConsumedValueRate"] ?? f.assumedPrice,
      value: `${formatDecimal(result.economics.selfConsumedValuePerKwh, locale, 2)} ${currency}/kWh – ${f[`valueSource_${result.economics.selfConsumedValueSource}`] ?? ""}`,
      origin: result.economics.selfConsumedValueSource === "user-override" ? "user" : "assumed",
    },
    {
      label: f["exportValueRate"] ?? f.assumedPrice,
      value: `${formatDecimal(result.economics.exportValuePerKwh, locale, 2)} ${currency}/kWh – ${f[`valueSource_${result.economics.exportValueSource}`] ?? ""}`,
      origin: result.economics.exportValueSource === "user-override" ? "user" : "assumed",
    },
    {
      label: f["gridConnection"] ?? "",
      value: (f["gridConnectionValue"] ?? "{{voltage}} V, {{phases}}")
        .replace("{{voltage}}", formatNumber(result.grid.voltageV, locale))
        .replace("{{phases}}", String(result.grid.phases)),
      origin: "assumed",
    },
    {
      label: f["priceChange"] ?? "",
      value: `${formatDecimal(result.lifetime.annualPriceChangeRate * 100, locale, 0)} % ${f["perYearShort"] ?? ""}`,
      origin: "assumed",
    },
    {
      label: f["calculationPeriod"] ?? "",
      value: `${result.lifetime.periodYears} ${f["yearsUnit"] ?? ""}`,
      origin: "assumed",
    },
    {
      label: f["degradation"] ?? "",
      value: `${formatDecimal(result.lifetime.annualDegradationRate * 100, locale, 1)} % ${f["perYearShort"] ?? ""}`,
      origin: "assumed",
    },
    { label: f.dataSource, value: result.resource.dataSource, origin: "external" },
  ];
  report.rows(assumptionRows, labels.origin);
  report.paragraph(f["priceMethodNote"] ?? "");
  report.paragraph(f["gridMethodNote"] ?? "");
  report.paragraph(
    (f["priceChangeNote"] ?? "").replace(
      "{{priceChange}}",
      formatDecimal(result.lifetime.annualPriceChangeRate * 100, locale, 0),
    ),
  );
  report.paragraph(
    (f["calculationPeriodNote"] ?? "")
      .replaceAll("{{years}}", String(result.lifetime.periodYears))
      .replace(
        "{{degradation}}",
        formatDecimal(result.lifetime.annualDegradationRate * 100, locale, 1),
      ),
  );
  report.noteBox(
    f["uncertaintyTitle"] ?? "",
    `${f["uncertaintyText"] ?? ""} ${labels.disclaimer}`,
  );

  const reportId = buildReportId(result);
  report.rows([
    { label: f["reportId"] ?? "", value: reportId },
    {
      label: `${labels.generated} · ${f.calculationVersion}`,
      value: `${isoDateOnly(result.calculatedAt)} · ${result.calculationVersion}`,
    },
  ]);
  report.footer(labels.appName, reportId);

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
