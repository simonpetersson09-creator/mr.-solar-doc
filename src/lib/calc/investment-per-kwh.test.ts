import { describe, expect, it } from "vitest";

import { calculateSolarSystem } from "./engine";
import { MARKETS } from "@/config/markets";
import { currencyForCountry } from "@/config/countries";
import type { CalculationInput } from "./types";

/** Stockholm-like PVGIS reference: ~938 kWh/kWp, south, 30 degrees. */
const MONTHLY_KWH_PER_KWP = [22, 45, 90, 121, 140, 137, 133, 111, 74, 41, 19, 5];

function makeInput(
  countryCode: string,
  overrides: Partial<CalculationInput> = {},
): CalculationInput {
  const market = MARKETS[countryCode] ?? MARKETS["SE"]!;
  return {
    location: {
      address: "Test 1",
      latitude: 55,
      longitude: 12,
      countryCode,
      region: undefined,
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
    consumption: { annualKwh: 10_000, monthlyKwh: null },
    electrical: { mainFuseAmp: 25, kwPerAmp: market.kwPerAmp },
    economics: {
      selfConsumedValuePerKwh: 1.8,
      exportValuePerKwh: 0.5,
      currency: currencyForCountry(countryCode),
      // Deliberately absent: the KPI must not depend on it.
      installationCostPerKwp: null,
    },
    selfConsumptionShare: 0.5,
    acceptedPaybackYears: 12,
    inverterSizesKw: market.inverterSizesKw,
    ...overrides,
  };
}

describe("investment level per produced kWh", () => {
  it("Sweden without a quote uses max investment, not 15 000 x kWp", () => {
    const result = calculateSolarSystem(makeInput("SE"));
    const cost = result.productionCost;
    expect(cost.investmentBasis).toBe("max-investment");
    expect(cost.investment).toBeCloseTo(result.investment.maxInvestment, 6);
    expect(cost.investment).not.toBeCloseTo(15_000 * result.installedKwp, 0);
    expect(cost.costPerKwh).toBeCloseTo(
      result.investment.maxInvestment / result.lifetime.totalProductionKwh,
      10,
    );
  });

  it("a quote never replaces the max investment in the main KPI", () => {
    const withoutQuote = calculateSolarSystem(makeInput("SE"));
    const withQuote = calculateSolarSystem(makeInput("SE", { quotePrice: 250_000 }));
    expect(withQuote.productionCost.costPerKwh).toBeCloseTo(
      withoutQuote.productionCost.costPerKwh!,
      10,
    );
    expect(withQuote.productionCost.quotePrice).toBe(250_000);
    expect(withQuote.investment.quotePaybackYears).not.toBeNull();
  });

  it("computes for every market without installationCostPerKwp", () => {
    for (const code of ["SE", "DE", "FR", "GB", "FI", "NL", "ES", "IT", "US", "JP"]) {
      if (!MARKETS[code]) continue;
      const result = calculateSolarSystem(makeInput(code));
      const cost = result.productionCost;
      expect(cost.costPerKwh, code).not.toBeNull();
      expect(Number.isFinite(cost.costPerKwh!), code).toBe(true);
      expect(cost.costPerKwh!, code).toBeGreaterThan(0);
      expect(result.economics.currency, code).toBe(currencyForCountry(code));
    }
  });

  it("uses the same lifetime period and denominator for cost and value", () => {
    const result = calculateSolarSystem(makeInput("DE"));
    const cost = result.productionCost;
    expect(cost.periodYears).toBe(result.lifetime.periodYears);
    expect(cost.totalProductionKwh).toBeCloseTo(result.lifetime.totalProductionKwh, 6);
    const scale =
      result.presentation.annualSavings / (result.lifetime.years[0]?.economicValue ?? 1);
    const expectedValue = result.lifetime.years.reduce(
      (sum, y) => sum + y.economicValue * scale,
      0,
    );
    expect(cost.totalEconomicValue).toBeCloseTo(expectedValue, 4);
    expect(cost.valuePerKwh).toBeCloseTo(cost.totalEconomicValue / cost.totalProductionKwh, 10);
    expect(cost.differencePerKwh).toBeCloseTo(cost.valuePerKwh - cost.costPerKwh!, 10);
  });

  it("keeps the price escalation in the value side", () => {
    const flat = calculateSolarSystem(makeInput("SE", { annualPriceChangeRate: 0 }));
    const rising = calculateSolarSystem(makeInput("SE", { annualPriceChangeRate: 0.04 }));
    expect(rising.productionCost.valuePerKwh).toBeGreaterThan(flat.productionCost.valuePerKwh);
  });

  it("masks the KPI when the electricity prices are unknown", () => {
    const result = calculateSolarSystem(
      makeInput("DE", {
        economics: {
          selfConsumedValuePerKwh: null,
          exportValuePerKwh: null,
          currency: "EUR",
          valuesMissing: true,
        },
      }),
    );
    expect(result.productionCost.costPerKwh).toBeNull();
    expect(result.productionCost.investmentBasis).toBe("none");
    expect(result.economicsStatus).toBe("incomplete");
  });
});
