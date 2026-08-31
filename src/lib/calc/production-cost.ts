/**
 * Production cost of the site's own solar electricity (simple LCOE).
 *
 * Central place for "what does a kWh from this roof cost?" so the UI and the
 * report never re-derive economics locally.
 *
 * Deliberately simple: the investment is divided by the total degraded
 * production over the calculation period. No discounting, financing cost,
 * maintenance or inverter replacement — consistent with the simple payback
 * model used elsewhere.
 */

export interface ProductionCostResult {
  /** Investment the cost is based on (quote price when given). */
  investment: number;
  /** Whether the investment comes from a user-entered quote. */
  investmentFromQuote: boolean;
  /**
   * What the investment figure represents. LCOE must be based on what the
   * system COSTS ("quote" or "installation-cost"), never on the
   * payback-derived maximum justifiable investment, which is a value figure.
   */
  investmentBasis: "quote" | "installation-cost" | "none";
  /** Total production over the calculation period, after degradation. */
  totalProductionKwh: number;
  periodYears: number;
  /** Cost per produced kWh, currency/kWh. Null when it cannot be derived. */
  costPerKwh: number | null;
  /** Weighted value of one produced kWh today, currency/kWh. */
  valuePerKwh: number;
  /** Share of production assumed to be self-consumed, 0..1. */
  selfConsumptionShare: number;
  /** valuePerKwh - costPerKwh. Null when the cost is unknown. */
  differencePerKwh: number | null;
}

/**
 * Weighted value of one produced kWh: self-consumed kWh replace bought
 * electricity, exported kWh earn the export compensation.
 */
export function weightedValuePerKwh(params: {
  selfConsumptionShare: number;
  selfConsumedValuePerKwh: number;
  exportValuePerKwh: number;
}): number {
  const share = Number.isFinite(params.selfConsumptionShare)
    ? Math.min(1, Math.max(0, params.selfConsumptionShare))
    : 0;
  const selfValue = Math.max(0, params.selfConsumedValuePerKwh || 0);
  const exportValue = Math.max(0, params.exportValuePerKwh || 0);
  return share * selfValue + (1 - share) * exportValue;
}

/**
 * Cost per produced kWh. The self-consumption share must NOT affect this
 * figure — it only affects the value side.
 */
export function calculateProductionCost(params: {
  investment: number;
  investmentFromQuote?: boolean | undefined;
  investmentBasis?: "quote" | "installation-cost" | "none" | undefined;
  totalProductionKwh: number;
  periodYears: number;
  selfConsumptionShare: number;
  selfConsumedValuePerKwh: number;
  exportValuePerKwh: number;
}): ProductionCostResult {
  const investment =
    Number.isFinite(params.investment) && params.investment > 0 ? params.investment : 0;
  const totalProductionKwh =
    Number.isFinite(params.totalProductionKwh) && params.totalProductionKwh > 0
      ? params.totalProductionKwh
      : 0;

  const costPerKwh =
    investment > 0 && totalProductionKwh > 0 ? investment / totalProductionKwh : null;

  const valuePerKwh = weightedValuePerKwh({
    selfConsumptionShare: params.selfConsumptionShare,
    selfConsumedValuePerKwh: params.selfConsumedValuePerKwh,
    exportValuePerKwh: params.exportValuePerKwh,
  });

  return {
    investment,
    investmentFromQuote: params.investmentFromQuote ?? false,
    investmentBasis:
      params.investmentBasis ??
      (investment <= 0 ? "none" : params.investmentFromQuote ? "quote" : "installation-cost"),
    totalProductionKwh,
    periodYears: params.periodYears,
    costPerKwh,
    valuePerKwh,
    selfConsumptionShare: Math.min(1, Math.max(0, params.selfConsumptionShare || 0)),
    differencePerKwh: costPerKwh === null ? null : valuePerKwh - costPerKwh,
  };
}
