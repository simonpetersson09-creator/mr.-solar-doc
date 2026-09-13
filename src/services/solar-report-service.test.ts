import { describe, expect, it } from "vitest";

import { reportAddress, reportLanguage, reportNeedsUnicodeFont } from "./solar-report-service";
import { calculateSolarSystem } from "@/lib/calc/engine";
import type { CalculationInput } from "@/lib/calc/types";
import { MARKETS } from "@/config/markets";
import { formatCurrency } from "@/lib/format";

/** Stockholm-like PVGIS reference, same shape the engine tests use. */
const MONTHLY_KWH_PER_KWP = [22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5];

function makeInput(): CalculationInput {
  const market = MARKETS["SE"]!;
  return {
    location: {
      address: "Testgatan 1, Stockholm",
      latitude: 59.33,
      longitude: 18.07,
      countryCode: "SE",
      region: "Stockholm",
    },
    resource: {
      annualKwhPerKwp: MONTHLY_KWH_PER_KWP.reduce((a, b) => a + b, 0),
      monthlyKwhPerKwp: MONTHLY_KWH_PER_KWP,
      orientation: "south",
      tiltDegrees: 30,
      orientationAssumed: false,
      tiltAssumed: false,
      dataSource: "PVGIS test",
      calculationDate: "2026-01-01",
    },
    consumption: { annualKwh: 18_000, monthlyKwh: null },
    electrical: { mainFuseAmp: 25, kwPerAmp: market.kwPerAmp },
    economics: {
      selfConsumedValuePerKwh: 1.44,
      exportValuePerKwh: 0.6,
      currency: "SEK",
    },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: market.inverterSizesKw,
  };
}

describe("reportAddress – the PDF must never print broken glyphs for a place", () => {
  it("keeps a Latin address exactly as the customer saw it", () => {
    expect(reportAddress("Testgatan 1, 111 22 Stockholm, Sverige", 59.33, 18.07)).toBe(
      "Testgatan 1, 111 22 Stockholm, Sverige",
    );
  });

  it("keeps Greek and Cyrillic addresses in their own script", () => {
    expect(reportAddress("Ερμού 10, Αθήνα, Ελλάδα", 37.98, 23.73)).toBe(
      "Ερμού 10, Αθήνα, Ελλάδα",
    );
    expect(reportAddress("Хрещатик 1, Київ, Україна", 50.45, 30.52)).toBe(
      "Хрещатик 1, Київ, Україна",
    );
  });

  it("switches the report to the Unicode font when only the address needs it", () => {
    expect(reportNeedsUnicodeFont(reportAddress("Ερμού 10, Αθήνα", 37.98, 23.73))).toBe(true);
    expect(reportNeedsUnicodeFont(reportAddress("Testgatan 1", 59.33, 18.07))).toBe(false);
  });

  it("falls back to the saved coordinates for a fully Devanagari address", () => {
    expect(reportAddress("मुंबई, महाराष्ट्र", 19.076, 72.8777)).toBe("19.0760, 72.8777");
  });

  it("keeps the renderable parts of a mixed-script address and adds the coordinates", () => {
    expect(reportAddress("तिलक मार्ग, New Delhi, India", 28.6139, 77.209)).toBe(
      "New Delhi, India (28.6139, 77.2090)",
    );
    expect(reportAddress("הרצל 1, Tel Aviv, Israel", 32.0853, 34.7818)).toBe(
      "Tel Aviv, Israel (32.0853, 34.7818)",
    );
  });

  it("handles a manually typed address the same way", () => {
    expect(reportAddress("Sveavägen 44", 59.34, 18.06)).toBe("Sveavägen 44");
    expect(reportAddress("दिल्ली", 28.61, 77.2)).toBe("28.6100, 77.2000");
  });

  it("writes the fallback report in English for unshapable languages", () => {
    expect(reportLanguage("hi")).toBe("en");
    expect(reportLanguage("he")).toBe("en");
    expect(reportLanguage("el")).toBe("el");
    expect(reportLanguage("uk")).toBe("uk");
  });
});

describe("lifetime totals – language may only change the formatting", () => {
  const result = calculateSolarSystem(makeInput());

  it("prints the same 30-year total in the summary and at the end of the table", () => {
    const running = result.lifetime.years.reduce((sum, year) => sum + year.economicValue, 0);
    expect(Math.round(result.lifetime.totalEconomicValue)).toBe(Math.round(running));
  });

  it("gives byte-identical digits for the 30-year total in every locale", () => {
    const rounded = Math.round(result.lifetime.totalEconomicValue);
    const digits = ["sv-SE", "el-GR", "uk-UA", "en-GB", "he-IL"].map((locale) =>
      formatCurrency(rounded, locale, "SEK").replace(/\D/g, ""),
    );
    expect(new Set(digits).size).toBe(1);
    expect(digits[0]).toBe(String(rounded));
  });
});
