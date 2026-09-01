/**
 * Investment level per produced kWh.
 *
 * NOTE ON SEMANTICS — this is deliberately *not* LCOE.
 *
 * The app does not hold a CAPEX database and must work in every market, so it
 * never guesses what an installation costs. Instead it uses the figure the
 * engine already derives: `maxInvestment` — the largest investment the
 * calculated economic value can motivate within the user's accepted payback
 * time. Divided by the lifetime production this answers:
 *
 *   "How much may each produced kWh cost you, at most, for the installation to
 *    pay for itself within your accepted payback time?"
 *
 * The value side answers the complementary question using the same lifetime
 * period:
 *
 *   "What is one produced kWh worth to you on average over the whole period?"
 *
 * Both figures therefore share the same denominator (total degraded lifetime
 * production) and the same currency. The difference is the head-room per kWh:
 * the part of each kWh's lifetime value that lies beyond the payback window.
 *
 * A user quote never replaces `maxInvestment` here; it is reported separately
 * so the UI can compare, and it drives quote payback elsewhere.
 */

export interface ProductionCostResult {
  /** The max justifiable investment the figure is based on. */
  investment: number;
  /** Kept for compatibility: the main KPI never uses the quote. */
  investmentFromQuote: boolean;
  /** What the investment figure represents. */
  investmentBasis: "max-investment" | "none";
  /** Total production over the calculation period, after degradation. */
  totalProductionKwh: number;
  /** Total economic value over the same period (price scenario included). */
  totalEconomicValue: number;
  periodYears: number;
  /** Max investment per produced kWh, currency/kWh. Null when underivable. */
  costPerKwh: number | null;
  /** Average lifetime value of one produced kWh, currency/kWh. */
  valuePerKwh: number;
  /** Share of production assumed to be self-consumed, 0..1 (year 1). */
  selfConsumptionShare: number;
  /** valuePerKwh - costPerKwh. Null when the cost is unknown. */
  differencePerKwh: number | null;
  /** Quote price when the user entered one, otherwise null. */
  quotePrice: number | null;
  /** The quote spread over lifetime production — a true cost/kWh. */
  quoteCostPerKwh: number | null;
}

/**
 * Weighted value of one produced kWh: self-consumed kWh replace bought
 * electricity, exported kWh earn the export compensation. Kept for callers
 * that need a today-prices figure; the main KPI uses lifetime totals.
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

function positive(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function calculateProductionCost(params: {
  /** Max justifiable investment from the engine (never the quote). */
  maxInvestment: number;
  /** Summed degraded production over the calculation period. */
  totalProductionKwh: number;
  /** Summed economic value over the same period. */
  totalEconomicValue: number;
  periodYears: number;
  selfConsumptionShare: number;
  quotePrice?: number | null | undefined;
}): ProductionCostResult {
  const investment = positive(params.maxInvestment);
  const totalProductionKwh = positive(params.totalProductionKwh);
  const totalEconomicValue = Math.max(
    0,
    Number.isFinite(params.totalEconomicValue) ? params.totalEconomicValue : 0,
  );
  const quotePrice = positive(params.quotePrice) || null;

  const costPerKwh =
    investment > 0 && totalProductionKwh > 0 ? investment / totalProductionKwh : null;
  const valuePerKwh = totalProductionKwh > 0 ? totalEconomicValue / totalProductionKwh : 0;

  return {
    investment,
    investmentFromQuote: false,
    investmentBasis: investment > 0 && totalProductionKwh > 0 ? "max-investment" : "none",
    totalProductionKwh,
    totalEconomicValue,
    periodYears: params.periodYears,
    costPerKwh,
    valuePerKwh,
    selfConsumptionShare: Math.min(1, Math.max(0, params.selfConsumptionShare || 0)),
    differencePerKwh: costPerKwh === null ? null : valuePerKwh - costPerKwh,
    quotePrice,
    quoteCostPerKwh:
      quotePrice != null && totalProductionKwh > 0 ? quotePrice / totalProductionKwh : null,
  };
}
