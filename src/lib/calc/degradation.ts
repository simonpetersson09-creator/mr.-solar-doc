/**
 * Long-term production degradation.
 *
 * Single source of truth for how solar output is assumed to decline over the
 * calculation period. Year 1 is always the unmodified PVGIS-based production;
 * subsequent years decline geometrically.
 */

import {
  DEFAULT_ANNUAL_SOLAR_DEGRADATION,
  LONG_TERM_CALCULATION_YEARS,
} from "@/config/constants";
import { calculateEconomicValue } from "./electricity-price";
import { splitProduction } from "./self-consumption";

export interface LifetimeYear {
  /** 1-based year index. */
  year: number;
  /** Remaining share of year-1 production, 0..1. */
  performanceFactor: number;
  productionKwh: number;
  selfConsumptionKwh: number;
  exportedKwh: number;
  /** Price escalation factor applied this year, (1 + rate)^(year-1). */
  priceFactor: number;
  economicValue: number;
}

export interface LifetimeProjection {
  years: LifetimeYear[];
  /** Length of the calculation period, in years. */
  periodYears: number;
  /** Annual degradation rate used, e.g. 0.005 = 0.5 %/year. */
  annualDegradationRate: number;
  /** Assumed annual change of electricity value (scenario), e.g. 0.02. */
  annualPriceChangeRate: number;
  totalProductionKwh: number;
  totalEconomicValue: number;
  /** Remaining share of year-1 production in the final year, 0..1. */
  finalYearPerformanceFactor: number;
}

/** Remaining share of the first-year production in a given year (1-based). */
export function performanceFactorForYear(
  year: number,
  annualDegradationRate: number = DEFAULT_ANNUAL_SOLAR_DEGRADATION,
): number {
  return Math.pow(1 - annualDegradationRate, Math.max(0, year - 1));
}

/** Geometrically degraded production for a given year (1-based). */
export function productionForYear(
  firstYearProductionKwh: number,
  year: number,
  annualDegradationRate: number = DEFAULT_ANNUAL_SOLAR_DEGRADATION,
): number {
  return firstYearProductionKwh * performanceFactorForYear(year, annualDegradationRate);
}

/**
 * Year-by-year production and economic value over the calculation period.
 * Electricity values follow the selected price development scenario.
 */
export function buildLifetimeProjection(params: {
  firstYearProductionKwh: number;
  selfConsumptionShare: number;
  selfConsumedValuePerKwh: number;
  exportValuePerKwh: number;
  /** Physical cap: self-consumption can never exceed what the site uses. */
  annualConsumptionKwh?: number | null | undefined;
  periodYears?: number | undefined;
  annualDegradationRate?: number | undefined;
  /** Assumed annual electricity price change, e.g. 0.02 = +2 %/year. */
  annualPriceChangeRate?: number | undefined;
}): LifetimeProjection {
  const periodYears = params.periodYears ?? LONG_TERM_CALCULATION_YEARS;
  const annualDegradationRate =
    params.annualDegradationRate ?? DEFAULT_ANNUAL_SOLAR_DEGRADATION;
  const annualPriceChangeRate = Number.isFinite(params.annualPriceChangeRate ?? 0)
    ? (params.annualPriceChangeRate ?? 0)
    : 0;

  const years: LifetimeYear[] = [];
  for (let year = 1; year <= periodYears; year += 1) {
    const performanceFactor = performanceFactorForYear(year, annualDegradationRate);
    const productionKwh = params.firstYearProductionKwh * performanceFactor;
    const split = splitProduction(
      productionKwh,
      params.selfConsumptionShare,
      params.annualConsumptionKwh,
    );
    // Compound electricity price development: year 1 uses today's price.
    const priceFactor = Math.pow(1 + annualPriceChangeRate, year - 1);
    const economics = calculateEconomicValue({
      selfConsumptionKwh: split.selfConsumptionKwh,
      exportedKwh: split.exportedKwh,
      selfConsumedValuePerKwh: params.selfConsumedValuePerKwh * priceFactor,
      exportValuePerKwh: params.exportValuePerKwh * priceFactor,
    });
    years.push({
      year,
      performanceFactor,
      productionKwh,
      selfConsumptionKwh: split.selfConsumptionKwh,
      exportedKwh: split.exportedKwh,
      priceFactor,
      economicValue: economics.totalValue,
    });
  }

  return {
    years,
    periodYears,
    annualDegradationRate,
    annualPriceChangeRate,
    totalProductionKwh: years.reduce((sum, y) => sum + y.productionKwh, 0),
    totalEconomicValue: years.reduce((sum, y) => sum + y.economicValue, 0),
    finalYearPerformanceFactor: performanceFactorForYear(periodYears, annualDegradationRate),
  };
}
