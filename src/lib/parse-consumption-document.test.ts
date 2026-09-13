import { describe, expect, it } from "vitest";
import { parseConsumptionText } from "./parse-consumption-document";
import { MAX_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH } from "./calc/validation";

describe("consumption import", () => {
  it("sums several rows inside the same period", () => {
    const parsed = parseConsumptionText(
      ["2025-01-01 01:00 1 kWh", "2025-01-01 02:00 2 kWh"].join("\n"),
    );
    expect(parsed.monthly?.[0]).toBe(3);
    expect(parsed.monthsFilled).toBe(1);
  });

  it("keeps a missing month unknown and an explicit zero as zero", () => {
    const parsed = parseConsumptionText(["Jan 2025 500 kWh", "Feb 2025 0 kWh"].join("\n"));
    expect(parsed.monthly?.[0]).toBe(500);
    expect(parsed.monthly?.[1]).toBe(0);
    expect(parsed.monthly?.[2]).toBeNull();
    expect(parsed.monthsFilled).toBe(2);
    // An incomplete series is never presented as a full year.
    expect(parsed.monthly?.filter((value) => value !== null).length).toBe(2);
  });

  it("does not mix years and lets a specific year be selected", () => {
    const text = [
      "2024-01 100 kWh",
      "2024-02 200 kWh",
      "2025-01 300 kWh",
      "2025-02 400 kWh",
      "2025-03 500 kWh",
    ].join("\n");
    const parsed = parseConsumptionText(text);
    expect(parsed.years).toEqual([2024, 2025]);
    expect(parsed.year).toBe(2025);
    expect(parsed.monthly?.[0]).toBe(300);
    const older = parseConsumptionText(text, { year: 2024 });
    expect(older.year).toBe(2024);
    expect(older.monthly?.[0]).toBe(100);
    expect(older.monthly?.[2]).toBeNull();
  });

  it("reads consumption, not the meter reading, on the same row", () => {
    const parsed = parseConsumptionText(
      "Jan 2025 Tidigare mätarställning 10000 kWh Förbrukning 1000 kWh",
    );
    expect(parsed.monthly?.[0]).toBe(1000);
  });

  it("asks for clarification instead of guessing a meter reading", () => {
    const parsed = parseConsumptionText("Jan 2025 Mätarställning 10000 kWh");
    expect(parsed.monthly).toBeNull();
    expect(parsed.ambiguous).toBe(true);
  });

  it("accepts a valid annual import above 200 000 kWh, up to the engine limit", () => {
    const parsed = parseConsumptionText("Årsförbrukning 450 000 kWh");
    expect(parsed.annual).toBe(450000);
    expect(MAX_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH).toBe(1_000_000);
    expect(parseConsumptionText("Årsförbrukning 2 000 000 kWh").annual).toBeNull();
  });

  it("surfaces a conflict between the stated annual figure and a complete monthly sum", () => {
    const months = Array.from(
      { length: 12 },
      (_, index) => `2025-${String(index + 1).padStart(2, "0")} 500 kWh`,
    );
    const conflicting = parseConsumptionText([...months, "Årsförbrukning 9000 kWh"].join("\n"));
    expect(conflicting.monthsFilled).toBe(12);
    expect(conflicting.monthlySum).toBe(6000);
    expect(conflicting.annual).toBe(9000);
    expect(conflicting.annualConflict).toBe(true);

    const agreeing = parseConsumptionText([...months, "Årsförbrukning 6000 kWh"].join("\n"));
    expect(agreeing.annualConflict).toBe(false);
  });

  it("does not add a summary row on top of the rows it summarises", () => {
    const parsed = parseConsumptionText(
      ["Jan 2025 100 kWh", "Feb 2025 200 kWh", "Totalt 300 kWh"].join("\n"),
    );
    expect(parsed.monthly?.[0]).toBe(100);
    expect(parsed.monthly?.[1]).toBe(200);
    expect(parsed.monthlySum).toBe(300);
    expect(parsed.annual).toBe(300);
    expect(parsed.monthsFilled).toBe(2);
  });

  it("uses the consumption column of a delimited export", () => {
    const parsed = parseConsumptionText(
      ["Månad\tMätarställning\tFörbrukning (kWh)", "2025-01\t10000\t1000", "2025-02\t11000\t1100"].join(
        "\n",
      ),
    );
    expect(parsed.monthly?.[0]).toBe(1000);
    expect(parsed.monthly?.[1]).toBe(1100);
  });

  it("keeps monthly values that look like years (1900-2100)", () => {
    const rows = [
      "Jan 2025;2100", "Feb 2025;1900", "Mar 2025;1700", "Apr 2025;1400",
      "Maj 2025;1200", "Jun 2025;1000", "Jul 2025;950", "Aug 2025;1000",
      "Sep 2025;1250", "Okt 2025;1550", "Nov 2025;1850", "Dec 2025;2100",
    ];
    const parsed = parseConsumptionText(["Manad;kWh", ...rows].join("\n"));
    expect(parsed.monthly).toEqual([
      2100, 1900, 1700, 1400, 1200, 1000, 950, 1000, 1250, 1550, 1850, 2100,
    ]);
    expect(parsed.monthsFilled).toBe(12);
    expect(parsed.year).toBe(2025);
    // Same file without a header row, and space separated.
    expect(parseConsumptionText(rows.join("\n")).monthly).toEqual(parsed.monthly);
    expect(parseConsumptionText(rows.map((r) => r.replace(";", " ")).join("\n")).monthly).toEqual(
      parsed.monthly,
    );
  });

  it("keeps values just inside and just outside the year-shaped range", () => {
    const parsed = parseConsumptionText(
      ["Jan 2025;1899", "Feb 2025;1900", "Mar 2025;2100", "Apr 2025;2101"].join("\n"),
    );
    expect(parsed.monthly?.slice(0, 4)).toEqual([1899, 1900, 2100, 2101]);
  });

  it("separates the date year from a year-shaped consumption value", () => {
    const parsed = parseConsumptionText("2025-01, 2020 kWh");
    expect(parsed.year).toBe(2025);
    expect(parsed.monthly?.[0]).toBe(2020);
    expect(parsed.monthsFilled).toBe(1);
  });

  it("reads separate year, month and consumption columns", () => {
    const parsed = parseConsumptionText(
      ["Ar;Manad;Forbrukning kWh", "2025;1;2020", "2025;2;1900"].join("\n"),
    );
    expect(parsed.year).toBe(2025);
    expect(parsed.monthly?.slice(0, 2)).toEqual([2020, 1900]);
  });

  it("never sums a real year as consumption", () => {
    const parsed = parseConsumptionText(["Rapport 2025", "Jan 2025", "Feb 2025"].join("\n"));
    expect(parsed.monthly).toBeNull();
    expect(parsed.monthsFilled).toBe(0);
    expect(parsed.annual).toBeNull();
  });

  it("keeps different years apart when values look like years", () => {
    const parsed = parseConsumptionText(
      ["Jan 2024;2000", "Jan 2025;2100", "Feb 2025;1900"].join("\n"),
    );
    expect(parsed.years).toEqual([2024, 2025]);
    expect(parsed.monthly?.slice(0, 2)).toEqual([2100, 1900]);
    expect(parseConsumptionText("Jan 2024;2000\nJan 2025;2100", { year: 2024 }).monthly?.[0]).toBe(
      2000,
    );
  });

  it("leaves missing months unknown rather than zero", () => {
    const parsed = parseConsumptionText(["Jan 2025;2100", "Mar 2025;1900"].join("\n"));
    expect(parsed.monthly?.[1]).toBeNull();
    expect(parsed.monthsFilled).toBe(2);
  });

  it("still ignores meter readings and does not double count totals", () => {
    const parsed = parseConsumptionText(
      [
        "Jan 2025 Mätarställning 45120 Förbrukning 2100 kWh",
        "Feb 2025 Mätarställning 47020 Förbrukning 1900 kWh",
        "Totalt 2025;4000",
      ].join("\n"),
    );
    expect(parsed.monthly?.slice(0, 2)).toEqual([2100, 1900]);
    expect(parsed.monthlySum).toBe(4000);
    expect(parsed.annual).toBe(4000);
  });
});
