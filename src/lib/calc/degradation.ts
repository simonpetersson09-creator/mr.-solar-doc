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
  economicValue: number;
}

export interface LifetimeProjection {
  years: LifetimeYear[];
  /** Length of the calculation period, in years. */
  periodYears: number;
  /** Annual degradation rate used, e.g. 0.005 = 0.5 %/year. */
  annualDegradationRate: number;
  /** Assumed annual change of electricity value. Always 0 in the base scenario. */
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
 * Electricity values are held constant — no inflation, no price escalation.
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
}): LifetimeProjection {
  const periodYears = params.periodYears ?? LONG_TERM_CALCULATION_YEARS;
  const annualDegradationRate =
    params.annualDegradationRate ?? DEFAULT_ANNUAL_SOLAR_DEGRADATION;

  const years: LifetimeYear[] = [];
  for (let year = 1; year <= periodYears; year += 1) {
    const performanceFactor = performanceFactorForYear(year, annualDegradationRate);
    const productionKwh = params.firstYearProductionKwh * performanceFactor;
    const split = splitProduction(
      productionKwh,
      params.selfConsumptionShare,
      params.annualConsumptionKwh,
    );
    const economics = calculateEconomicValue({
      selfConsumptionKwh: split.selfConsumptionKwh,
      exportedKwh: split.exportedKwh,
      selfConsumedValuePerKwh: params.selfConsumedValuePerKwh,
      exportValuePerKwh: params.exportValuePerKwh,
    });
    years.push({
      year,
      performanceFactor,
      productionKwh,
      selfConsumptionKwh: split.selfConsumptionKwh,
      exportedKwh: split.exportedKwh,
      economicValue: economics.totalValue,
    });
  }

  return {
    years,
    periodYears,
    annualDegradationRate,
    annualPriceChangeRate: 0,
    totalProductionKwh: years.reduce((sum, y) => sum + y.productionKwh, 0),
    totalEconomicValue: years.reduce((sum, y) => sum + y.economicValue, 0),
    finalYearPerformanceFactor: performanceFactorForYear(periodYears, annualDegradationRate),
  };
}
