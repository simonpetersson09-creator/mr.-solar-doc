import { jsPDF } from "jspdf";
import type { CalculationResult, ValueOrigin } from "@/lib/calc/types";
import { formatCurrency, formatDecimal, formatNumber, isoDateOnly } from "@/lib/format";
import { formatConnectionCapacity } from "@/lib/connection-display";

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
  /** Shown instead of money when the market has no verified price data. */
  economicsRequiresPrice: string;
  /** Short inline placeholder for a money value that cannot be calculated. */
  economicsRequiresPriceShort: string;
  /** Warning shown when the grid profile is generic/unverified. */
  gridUnverifiedWarning: string;
  /** Heading for the unverified grid warning. */
  gridUnverifiedTitle: string;
  /** Heading for the FAQ page. */
  faqTitle: string;
  /** FAQ entries rendered on their own page at the end of the report. */
  faqItems: Array<{ q: string; a: string }>;
}

export interface ReportOptions {
  result: CalculationResult;
  labels: ReportLabels;
  locale: string;
}

const PAGE = { width: 210, height: 297, margin: 18 };
/** Palette mirrors the app design tokens: forest green primary, solar orange accent, cream surfaces. */
const INK: [number, number, number] = [17, 38, 26];
const MUTED: [number, number, number] = [108, 122, 114];
const PRIMARY: [number, number, number] = [22, 65, 45];
const ACCENT: [number, number, number] = [245, 164, 32];
const CREAM: [number, number, number] = [252, 250, 241];
const LINE: [number, number, number] = [225, 226, 218];


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
    // Maths symbols outside WinAnsi render as stray quotes in Helvetica.
    .replace(/\u221a3/g, "1,73")
    .replace(/\u221a/g, "sqrt")
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
    this.doc.setFillColor(...PRIMARY);
    this.doc.rect(0, 0, PAGE.width, 30, "F");
    this.doc.setFillColor(...ACCENT);
    this.doc.rect(0, 30, PAGE.width, 1.6, "F");
    this.doc.setTextColor(...CREAM);
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

  /**
   * Soft break: keeps the flow going when the next block still fits,
   * otherwise starts a new page. Avoids half-empty pages.
   */
  softBreak(neededHeight = 60) {
    if (this.y <= PAGE.margin) return;
    if (this.y + neededHeight > PAGE.height - PAGE.margin) {
      this.pageBreak();
    } else {
      this.y += 8;
    }
  }


  /** Smaller group label inside a section (e.g. the assumption groups). */
  subheading(text: string) {
    if (!text.trim()) return;
    this.ensureSpace(12);
    this.y += 2;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9.5);
    this.doc.setTextColor(...PRIMARY);
    this.doc.text(text, PAGE.margin, this.y);
    this.y += 5;
  }

  sectionTitle(text: string) {

    this.ensureSpace(18);
    this.y += 2;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(12);
    this.doc.setTextColor(...PRIMARY);
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
      this.doc.setFillColor(...PRIMARY);
      this.doc.setDrawColor(...PRIMARY);
      this.doc.setLineWidth(0.2);
      this.doc.roundedRect(x, this.y, width, 24, 2.5, 2.5, "FD");
      this.doc.setFontSize(8);
      this.doc.setTextColor(232, 238, 232);
      this.doc.setFont("helvetica", "normal");
      this.doc.text(this.doc.splitTextToSize(item.label, width - 6), x + 3, this.y + 6);
      this.doc.setTextColor(...ACCENT);
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

  /**
   * Value rows. The value is primary (bold, ink); the provenance label is
   * deliberately secondary: small, muted and in its own right-hand column, so
   * the report stays readable instead of drowning in parentheses.
   */
  rows(rows: Row[], originLabels?: Record<ValueOrigin, string>) {
    const full = PAGE.width - PAGE.margin * 2;
    const originColumn = originLabels ? 30 : 0;
    rows.forEach((row, index) => {
      const originText = row.origin && originLabels ? originLabels[row.origin] : "";
      this.doc.setFontSize(9.5);
      this.doc.setFont("helvetica", "normal");
      const labelWidth = this.doc.getTextWidth(row.label);
      this.doc.setFont("helvetica", "bold");
      const valueWidth = this.doc.getTextWidth(row.value);

      // Wrap onto a second line when label and value would collide.
      const stacked = labelWidth + valueWidth + originColumn + 10 > full;
      const valueLines = stacked
        ? (this.doc.splitTextToSize(row.value, full - originColumn - 4) as string[])
        : [row.value];
      const height = stacked ? 6 + valueLines.length * 5 : 8;
      this.ensureSpace(height + 1);

      if (index % 2 === 0) {
        this.doc.setFillColor(...CREAM);
        this.doc.rect(PAGE.margin, this.y - 4.5, full, height, "F");
      }
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(...MUTED);
      this.doc.text(row.label, PAGE.margin + 2, this.y);
      const valueRight = PAGE.width - PAGE.margin - 2 - originColumn;
      this.doc.setFont("helvetica", "bold");
      this.doc.setTextColor(...INK);
      if (stacked) {
        valueLines.forEach((line, lineIndex) => {
          this.doc.text(line, valueRight, this.y + 5 + lineIndex * 5, { align: "right" });
        });
      } else {
        this.doc.text(row.value, valueRight, this.y, { align: "right" });
      }
      if (originText) {
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(6.8);
        this.doc.setTextColor(...MUTED);
        this.doc.text(originText, PAGE.width - PAGE.margin - 2, stacked ? this.y + 5 : this.y, {
          align: "right",
        });
        this.doc.setFontSize(9.5);
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
      if (paired) draw(comparison![index] ?? 0, slotX + barWidth + 1.5, PRIMARY);
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
        [legend.consumption, PRIMARY],
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

  /**
   * Explanatory note. The height is measured before reserving space, and long
   * notes are split across pages — otherwise the tail of the text is drawn
   * below the page edge and silently disappears.
   */
  paragraph(text: string) {
    if (!text.trim()) return;
    const lineHeight = 4;
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(...MUTED);
    let lines = this.doc.splitTextToSize(text, PAGE.width - PAGE.margin * 2) as string[];

    while (lines.length > 0) {
      const available = PAGE.height - PAGE.margin - this.y;
      let fitCount = Math.floor(available / lineHeight);
      if (fitCount < Math.min(2, lines.length)) {
        // Not enough room for a readable chunk — continue on the next page.
        this.doc.addPage();
        this.y = PAGE.margin;
        fitCount = Math.floor((PAGE.height - PAGE.margin * 2) / lineHeight);
      }
      const chunk = lines.slice(0, fitCount);
      this.doc.setFont("helvetica", "italic");
      this.doc.setFontSize(8.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(chunk, PAGE.margin, this.y);
      this.y += chunk.length * lineHeight;
      lines = lines.slice(fitCount);
    }
    this.y += 4;
  }

  /** Bordered note block, used for the closing "what can affect the outcome" text. */
  noteBox(title: string, text: string) {
    const width = PAGE.width - PAGE.margin * 2;
    this.doc.setFontSize(8.5);
    this.doc.setFont("helvetica", "normal");
    const lines = this.doc.splitTextToSize(text, width - 8) as string[];
    const height = 12 + lines.length * 4;
    this.ensureSpace(height + 4);
    this.doc.setFillColor(...CREAM);
    this.doc.setDrawColor(...PRIMARY);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(PAGE.margin, this.y, width, height, 2.5, 2.5, "FD");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...PRIMARY);
    this.doc.text(title, PAGE.margin + 4, this.y + 6);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(...MUTED);
    this.doc.text(lines, PAGE.margin + 4, this.y + 11);
this.y += height + 6;
  }

  /** FAQ page: question in bold primary, answer in muted, on cream blocks. */
  faq(title: string, items: Array<{ q: string; a: string }>) {
    this.sectionTitle(title);
    const width = PAGE.width - PAGE.margin * 2;
    items.forEach((item) => {
      const questionLines = this.doc.splitTextToSize(item.q, width - 6) as string[];
      const answerLines = this.doc.splitTextToSize(item.a, width - 6) as string[];
      const blockHeight = questionLines.length * 5 + answerLines.length * 4 + 9;
      this.ensureSpace(blockHeight + 2);
      this.doc.setFillColor(...CREAM);
      this.doc.roundedRect(PAGE.margin, this.y - 5, width, blockHeight, 2.5, 2.5, "F");
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(...PRIMARY);
      this.doc.text(questionLines, PAGE.margin + 3, this.y);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(answerLines, PAGE.margin + 3, this.y + questionLines.length * 5 + 2);
      this.y += blockHeight + 4;
    });
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
    highlight?: { year: number; label: string } | null,
  ) {
    const height = 36;
    this.ensureSpace(height + 26);
    const width = PAGE.width - PAGE.margin * 2;
    const baseline = this.y + height;
    const maxValue = Math.max(...points.map((p) => p.value), 1);
    const maxYear = Math.max(...points.map((p) => p.year), 1);
    const xFor = (year: number) => PAGE.margin + ((year - 1) / (maxYear - 1 || 1)) * width;
    const yFor = (value: number) => baseline - (value / maxValue) * height;

    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.2);
    this.doc.line(PAGE.margin, baseline, PAGE.margin + width, baseline);

    // Chosen payback year: vertical guide behind the curve.
    if (highlight) {
      const hx = xFor(highlight.year);
      this.doc.setDrawColor(...PRIMARY);
      this.doc.setLineWidth(0.4);
      this.doc.setLineDashPattern([1, 1], 0);
      this.doc.line(hx, baseline, hx, baseline - height);
      this.doc.setLineDashPattern([], 0);
      this.doc.setFontSize(6.5);
      this.doc.setTextColor(...PRIMARY);
      this.doc.text(highlight.label, hx, baseline - height - 2, {
        align: hx > PAGE.margin + width * 0.6 ? "right" : "left",
      });
    }

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
      this.doc.setTextColor(...PRIMARY);
      const align = year === maxYear ? "right" : year === 1 ? "left" : "center";
      this.doc.text(formatValue(point.value), x, y - 2.5, { align });
      this.doc.setTextColor(...MUTED);
      this.doc.text(`${axisLabel} ${year}`, x, baseline + 4, { align });
    });
    if (highlight) {
      const point = points.find((p) => p.year === highlight.year);
      if (point) {
        this.doc.setFillColor(...PRIMARY);
        this.doc.circle(xFor(point.year), yFor(point.value), 1, "F");
      }
    }
    this.y = baseline + 10;
  }

  /**
   * Year-by-year table for the calculation period, laid out in two columns so
   * 30 years fit on one page. Values are pre-formatted by the caller.
   */
  lifetimeTable(
    rows: Array<{
      year: number;
      production: string;
      value: string;
      cumulative: string;
      highlighted?: boolean;
    }>,
    head: { year: string; production: string; value: string; cumulative: string },
  ) {
    const gap = 6;
    const columnWidth = (PAGE.width - PAGE.margin * 2 - gap) / 2;
    const half = Math.ceil(rows.length / 2);
    const columns = [rows.slice(0, half), rows.slice(half)];
    const rowHeight = 5;
    const blockHeight = 6 + half * rowHeight + 2;
    this.ensureSpace(blockHeight + 6);
    const top = this.y;

    columns.forEach((columnRows, columnIndex) => {
      const x = PAGE.margin + columnIndex * (columnWidth + gap);
      const cols = [
        { key: "year" as const, w: columnWidth * 0.14, align: "left" as const },
        { key: "production" as const, w: columnWidth * 0.26, align: "right" as const },
        { key: "value" as const, w: columnWidth * 0.28, align: "right" as const },
        { key: "cumulative" as const, w: columnWidth * 0.32, align: "right" as const },
      ];
      const xAt = (index: number) =>
        x + cols.slice(0, index).reduce((sum, col) => sum + col.w, 0) + cols[index]!.w;

      // Header
      this.doc.setFillColor(...PRIMARY);
      this.doc.roundedRect(x, top, columnWidth, 5.4, 1, 1, "F");
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(6.5);
      this.doc.setTextColor(...CREAM);
      this.doc.text(head.year, x + 1.5, top + 3.7);
      cols.slice(1).forEach((col, index) => {
        this.doc.text(head[col.key], xAt(index + 1) - 1.5, top + 3.7, { align: "right" });
      });

      this.doc.setFont("helvetica", "normal");
      columnRows.forEach((row, index) => {
        const rowY = top + 6 + index * rowHeight;
        if (row.highlighted) {
          this.doc.setFillColor(...ACCENT);
          this.doc.roundedRect(x, rowY - 0.2, columnWidth, rowHeight, 0.8, 0.8, "F");
        } else if (index % 2 === 0) {
          this.doc.setFillColor(...CREAM);
          this.doc.rect(x, rowY - 0.2, columnWidth, rowHeight, "F");
        }
        this.doc.setFontSize(6.5);
        this.doc.setTextColor(...(row.highlighted ? PRIMARY : INK));
        this.doc.text(String(row.year), x + 1.5, rowY + 3.3);
        this.doc.setTextColor(...(row.highlighted ? PRIMARY : MUTED));
        this.doc.text(row.production, xAt(1) - 1.5, rowY + 3.3, { align: "right" });
        this.doc.setTextColor(...(row.highlighted ? PRIMARY : INK));
        this.doc.text(row.value, xAt(2) - 1.5, rowY + 3.3, { align: "right" });
        this.doc.setFont("helvetica", "bold");
        this.doc.text(row.cumulative, xAt(3) - 1.5, rowY + 3.3, { align: "right" });
        this.doc.setFont("helvetica", "normal");
      });
    });

    this.y = top + blockHeight + 4;
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
  /**
   * S5: a missing electricity price is NOT zero. When the economic inputs are
   * incomplete the report states that instead of printing a credible "0".
   */
  const economicsIncomplete = result.economicsStatus === "incomplete";
  const money = (value: number) =>
    economicsIncomplete
      ? labels.economicsRequiresPriceShort
      : formatCurrency(value, locale, options.result.economics.currency);
  /**
   * A per-kWh assumption is only printed when the value really exists. A null
   * / missing value is never formatted as "0,00", and "standard value" is only
   * claimed when there is an actual standard value behind it.
   */
  const rate = (
    value: number | null | undefined,
    availability: "available" | "missing" | "not-applicable",
    source: string,
  ) => {
    if (availability !== "available" || value == null || !Number.isFinite(value)) {
      return labels.economicsRequiresPriceShort;
    }
    const sourceLabel = labels.fields[`valueSource_${source}`] ?? "";
    const amount = `${formatDecimal(value, locale, 2)} ${options.result.economics.currency}/kWh`;
    return sourceLabel ? `${amount} – ${sourceLabel}` : amount;
  };
  /** S6: unverified grid assumptions follow the result into the PDF. */
  const gridUnverified = result.grid.profileStatus !== "verified";
  const currency = result.economics.currency;
  const report = new ReportDocument();

  report.header(
    labels.title,
    labels.appName,
    result.location.address,
    `${labels.generated}: ${isoDateOnly(result.calculatedAt)}`,
  );

  const investmentValue = result.investment.quotePrice ?? result.investment.maxInvestmentRounded;
  const paybackValue =
    result.investment.quotePaybackYears ?? result.investment.acceptedPaybackYears;
  const priceChangePercent = result.lifetime.annualPriceChangeRate * 100;
  const priceChangeIsFlat = Math.abs(priceChangePercent) < 0.05;

  // Executive summary: the four figures a homeowner actually decides on.
  report.sectionTitle(labels.summary);
  report.highlights([
    {
      label: f["panelPower"] ?? f.installedDc,
      value: `${formatDecimal(result.installedKwp, locale)} kWp (${result.panelCount} ${f["panelsUnit"]})`,
    },
    {
      label: f.annualProduction,
      value: `${formatNumber(result.presentation.annualProductionKwh, locale)} kWh`,
    },
    {
      label: f["annualValue"] ?? f.savings,
      value: money(result.presentation.annualSavings),
    },
    {
      label: f["investment"] ?? f["maxInvestment"] ?? "",
      value: money(investmentValue),
    },
  ]);
  report.rows([
    {
      label: f["acceptedPayback"] ?? f["paybackTime"] ?? "",
      value: economicsIncomplete
        ? labels.economicsRequiresPriceShort
        : `${formatDecimal(paybackValue, locale, 1)} ${f["yearsUnit"] ?? ""}`,
    },
    {
      label: (f["savings30"] ?? f.savings).replace(
        "{{years}}",
        String(result.lifetime.periodYears),
      ),
      value: money(Math.round(result.lifetime.totalEconomicValue)),
    },
    { label: f.inverter, value: `${formatNumber(result.inverterKw, locale)} kW` },
  ]);
  if (economicsIncomplete) report.paragraph(labels.economicsRequiresPrice);

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

  // Method line: mirrors the assumptions actually used, so the summary can never
  // claim "unchanged values" while the projection applies a yearly change.
  report.paragraph(
    (priceChangeIsFlat ? (f["summaryMethodFlat"] ?? "") : (f["summaryMethodTrend"] ?? ""))
      .replace(
        "{{degradation}}",
        formatDecimal(result.lifetime.annualDegradationRate * 100, locale, 1),
      )
      .replace("{{priceChange}}", formatDecimal(priceChangePercent, locale, 1)),
  );


  report.softBreak(70);

  if (gridUnverified) {
    report.paragraph(`${labels.gridUnverifiedTitle}: ${labels.gridUnverifiedWarning}`);
  }
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
      {
        label:
          result.connection?.type === "contracted-kva"
            ? (f["connectionKva"] ?? f.mainFuse)
            : result.connection?.type === "contracted-kw"
              ? (f["connectionKw"] ?? f.mainFuse)
              : f.mainFuse,
        value:
          formatConnectionCapacity(result.connection, locale) ??
          `${result.mainFuseAmp ?? "-"} A`,
        origin: "user",
      },
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

  report.softBreak(80);
  report.sectionTitle(labels.production);
  report.rows(
    [
      {
        label: f.specificYield,
        value: `${formatNumber(result.resource.annualKwhPerKwp, locale)} kWh/kWp`,
        origin: "external",
      },
      {
        label: f.annualProduction,
        value: `${formatNumber(result.presentation.annualProductionKwh, locale)} kWh`,
        origin: "calculated",
      },
      { label: f.dataSource, value: result.resource.dataSource, origin: "external" },
    ],
    labels.origin,
  );
  report.paragraph(f["specificYieldNote"] ?? "");

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
      // Derived from the self-consumption rate — a calculated result, never
      // something the user stated.
      {
        label: f.selfConsumption,
        value: `${formatNumber(result.presentation.selfConsumptionKwh, locale)} kWh`,
        origin: "calculated",
      },
      {
        label: f.exported,
        value: `${formatNumber(result.presentation.exportedKwh, locale)} kWh`,
        origin: "calculated",
      },
      {
        label: f["selfSufficiencyRate"] ?? "",
        value: `${formatNumber(Math.round(result.selfSufficiencyRate * 100), locale)} %`,
        origin: "calculated",
      },

    ],
    labels.origin,
  );
  report.paragraph(
    `${f["selfConsumptionRateNote"] ?? ""} ${f["selfSufficiencyRateNote"] ?? ""}`,
  );

  report.softBreak(80);
  report.sectionTitle(labels.economics);
  report.rows(
    [
      {
        label: f["selfConsumptionValue"] ?? f.selfConsumption,
        value: money(result.presentation.selfConsumptionValue),
        origin: "calculated",
      },
      {
        label: f["exportValue"] ?? f.exported,
        value: money(result.presentation.exportValue),
        origin: "calculated",
      },
      {
        label: f["totalAnnualBenefit"] ?? f.economicValue,
        value: money(result.presentation.annualSavings),
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
        value: money(result.investment.maxInvestmentRounded),
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
  report.paragraph(f["investmentNote"] ?? "");
  if (result.investment.quotePrice != null) report.paragraph(labels.quoteNote);


  // ── Long-term development page ───────────────────────────────────────────
  // Everything below is read straight from result.lifetime (the same projection
  // the results page uses). No economics are recomputed here.
  let running = 0;
  const cumulative = result.lifetime.years.map((year) => {
    running += year.economicValue;
    return { year: year.year, value: running };
  });
  const periodYears = result.lifetime.periodYears;
  const paybackYear = Math.round(
    result.investment.quotePaybackYears ?? result.investment.acceptedPaybackYears,
  );
  const markerYears = [1, 10, 20, periodYears].filter(
    (year, index, all) => year <= periodYears && all.indexOf(year) === index,
  );
  const cumulativeAt = (year: number) =>
    cumulative.find((point) => point.year === year)?.value ?? 0;
  const productionAt = (year: number) =>
    result.lifetime.years.find((entry) => entry.year === year)?.productionKwh ?? 0;

  report.pageBreak();
  report.sectionTitle(
    (f["lifetimeTitle"] ?? f["longTermChartTitle"] ?? "").replace(
      "{{years}}",
      String(periodYears),
    ),
  );
  if (economicsIncomplete) {
    report.paragraph(labels.economicsRequiresPrice);
  } else
  report.cumulativeChart(
    cumulative,
    markerYears,
    (value) => formatCurrency(Math.round(value), locale, currency),
    f["yearShort"] ?? "",
    paybackYear > 1 && paybackYear <= periodYears
      ? {
          year: paybackYear,
          label: (f["lifetimePaybackMarker"] ?? "").replace(
            "{{years}}",
            formatNumber(paybackYear, locale),
          ),
        }
      : null,
  );
  // Year 1 next to the accumulated milestones: the difference between "per year"
  // and "over the whole period" must be obvious at a glance.
  report.highlights([
    {
      label: f["lifetimeYearOne"] ?? f["annualValue"] ?? "",
      value: money(Math.round(cumulativeAt(1))),
    },
    ...[10, 20, periodYears]
      .filter((year, index, all) => year <= periodYears && all.indexOf(year) === index)
      .map((year) => ({
        label: (f["lifetimeAfterYears"] ?? "").replace("{{years}}", String(year)),
        value: money(Math.round(cumulativeAt(year))),
      })),
  ]);

  report.lifetimeTable(
    result.lifetime.years.map((entry) => ({
      year: entry.year,
      production: `${formatNumber(Math.round(entry.productionKwh), locale)}`,
      value: money(Math.round(entry.economicValue)),
      cumulative: money(Math.round(cumulativeAt(entry.year))),
      highlighted: entry.year === paybackYear,
    })),
    {
      year: f["yearShort"] ?? "",
      production: f["lifetimeColProduction"] ?? "",
      value: f["lifetimeColValue"] ?? "",
      cumulative: f["lifetimeColCumulative"] ?? "",
    },
  );
  // Ties the highlighted year in the table to the investment level, so the two
  // figures read as one calculation instead of two.
  if (!economicsIncomplete && paybackYear >= 1 && paybackYear <= periodYears) {
    report.paragraph(
      (f["lifetimeInvestmentLink"] ?? "")
        .replace("{{years}}", formatNumber(paybackYear, locale))
        .replace("{{amount}}", money(result.investment.maxInvestmentRounded)),
    );
  }

  report.paragraph(
    (f["lifetimeNote"] ?? "")
      .replaceAll("{{years}}", String(periodYears))
      .replace(
        "{{degradation}}",
        formatDecimal(result.lifetime.annualDegradationRate * 100, locale, 1),
      )
      .replace(
        "{{priceChange}}",
        formatDecimal(result.lifetime.annualPriceChangeRate * 100, locale, 1),
      ),
  );


  report.pageBreak();
  report.sectionTitle(f["keyAssumptions"] ?? labels.assumptions);
  if (gridUnverified) {
    report.paragraph(`${labels.gridUnverifiedTitle}: ${labels.gridUnverifiedWarning}`);
  }
  const selfConsumptionSourceLabel =
    f[`selfConsumptionSource_${result.selfConsumptionSource}`] ?? "";

  // Grouped so a reader can tell production, economics and technical
  // assumptions apart instead of scanning one long list.
  report.subheading(f["assumptionsProduction"] ?? "");
  report.rows(
    [
      {
        label: f.specificYield,
        value: `${formatNumber(result.resource.annualKwhPerKwp, locale)} kWh/kWp`,
        origin: "external",
      },
      { label: f.dataSource, value: result.resource.dataSource, origin: "external" },
      {
        label: f["degradation"] ?? "",
        value: `${formatDecimal(result.lifetime.annualDegradationRate * 100, locale, 1)} % ${f["perYearShort"] ?? ""}`,
        origin: "assumed",
      },
      {
        label: f["calculationPeriod"] ?? "",
        value: `${result.lifetime.periodYears} ${f["yearsUnit"] ?? ""}`,
        origin: "assumed",
      },
    ],
    labels.origin,
  );

  report.subheading(f["assumptionsEconomy"] ?? "");
  report.rows(
    [
      {
        label: f["selfConsumptionShare"] ?? f.selfConsumption,
        value: `${formatNumber(result.presentation.selfConsumptionPercent, locale)} % – ${selfConsumptionSourceLabel}`,
        origin: selfConsumptionOrigin,
      },
      {
        label: f["selfConsumedValueRate"] ?? f.assumedPrice,
        value: rate(
          result.economics.selfConsumedValuePerKwh,
          result.economics.availability.selfConsumedValue,
          result.economics.selfConsumedValueSource,
        ),
        origin: result.economics.selfConsumedValueSource === "user-override" ? "user" : "assumed",
      },
      {
        label: f["exportValueRate"] ?? f.assumedPrice,
        value: rate(
          result.economics.exportValuePerKwh,
          result.economics.availability.exportValue,
          result.economics.exportValueSource,
        ),
        origin: result.economics.exportValueSource === "user-override" ? "user" : "assumed",
      },
      {
        label: f["priceChange"] ?? "",
        value: `${formatDecimal(priceChangePercent, locale, 1)} % ${f["perYearShort"] ?? ""}`,
        origin: "assumed",
      },
    ],
    labels.origin,
  );
  report.paragraph(f["priceMethodNote"] ?? "");
  report.paragraph(
    (priceChangeIsFlat
      ? (f["priceChangeNoteFlat"] ?? "")
      : (f["priceChangeNoteTrend"] ?? "")
    ).replaceAll(
      "{{priceChange}}",
      `${priceChangePercent > 0 ? "+" : ""}${formatDecimal(priceChangePercent, locale, 1)}`,
    ),
  );

  report.subheading(f["assumptionsTechnical"] ?? "");
  report.rows(
    [
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
    ],
    labels.origin,
  );
  // The method note must describe the user's actual grid profile, never a
  // fixed 400 V three-phase assumption.
  const isDefaultGrid = result.grid.serviceType === "three-phase" && result.grid.voltageV === 400;
  const gridNote = isDefaultGrid
    ? (f["gridMethodNote"] ?? "")
    : (f["gridMethodNoteDynamic"] ?? f["gridMethodNote"] ?? "")
        .replaceAll("{{voltage}}", formatNumber(result.grid.voltageV, locale))
        .replaceAll("{{phases}}", String(result.grid.phases))
        .replaceAll("{{factor}}", formatDecimal(result.grid.serviceType === "three-phase" ? 1.73 : 1, locale, 2));
  report.paragraph(gridNote);
  report.noteBox(
    f["uncertaintyTitle"] ?? "",
    `${f["uncertaintyText"] ?? ""} ${labels.disclaimer}`,
  );

  // FAQ closes the report; the metadata is a discreet closing line, not a page.
  report.pageBreak();
  report.faq(labels.faqTitle, labels.faqItems);

  const reportId = buildReportId(result);
  report.paragraph(
    `${f["reportId"] ?? ""}: ${reportId} · ${labels.generated}: ${isoDateOnly(result.calculatedAt)} · ${f.calculationVersion}: ${result.calculationVersion}`,
  );
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
