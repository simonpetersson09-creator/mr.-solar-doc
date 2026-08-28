/**
 * Simple payback economics.
 *
 * Inverts the usual question: instead of guessing a market price for the
 * installation, it derives how large an investment the calculated annual
 * economic value can motivate within the user's accepted payback time.
 *
 * Deliberately *simple* payback — no electricity price development, inflation,
 * discount rate, financing cost, degradation, maintenance or inverter
 * replacement. The shape below leaves room for an advanced (NPV/IRR) model
 * later without changing call sites.
 */

export interface MaxInvestmentResult {
  /** Annual economic value used for the calculation (currency/yr). */
  annualEconomicValue: number;
  /** Payback time the user selected, in years. */
  acceptedPaybackYears: number;
  /** Exact value × years. */
  maxInvestment: number;
  /** Consumer-friendly rounded figure ("ca 57 000"). */
  maxInvestmentRounded: number;
  /** Price from a quote the user entered, if any. */
  quotePrice: number | null;
  /** Simple payback implied by that quote price, in years. */
  quotePaybackYears: number | null;
  /** "simple" today; future models may add "npv". */
  method: "simple";
}

function roundForConsumer(value: number): number {
  if (value >= 10_000) return Math.round(value / 1000) * 1000;
  if (value >= 1_000) return Math.round(value / 100) * 100;
  return Math.round(value / 10) * 10;
}

export function calculateMaxInvestment(
  annualEconomicValue: number,
  acceptedPaybackYears: number,
  quotePrice?: number | null,
): MaxInvestmentResult {
  const safeValue = Number.isFinite(annualEconomicValue) ? Math.max(0, annualEconomicValue) : 0;
  const safeYears = Number.isFinite(acceptedPaybackYears) ? Math.max(0, acceptedPaybackYears) : 0;
  const maxInvestment = safeValue * safeYears;
  const safeQuote =
    quotePrice != null && Number.isFinite(quotePrice) && quotePrice > 0 ? quotePrice : null;

  return {
    annualEconomicValue: safeValue,
    acceptedPaybackYears: safeYears,
    maxInvestment,
    maxInvestmentRounded: roundForConsumer(maxInvestment),
    quotePrice: safeQuote,
    quotePaybackYears: safeQuote !== null && safeValue > 0 ? safeQuote / safeValue : null,
    method: "simple",
  };
}
