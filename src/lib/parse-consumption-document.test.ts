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
});
