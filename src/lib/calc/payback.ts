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

/** Accumulated value over `years`, allowing a fractional final year. */
function accumulate(values: readonly number[], years: number): number {
  let total = 0;
  for (let i = 0; i < Math.floor(years); i += 1) {
    total += values[Math.min(i, values.length - 1)] ?? 0;
  }
  const fraction = years - Math.floor(years);
  if (fraction > 0) {
    const next = values[Math.min(Math.floor(years), values.length - 1)] ?? 0;
    total += next * fraction;
  }
  return total;
}

/** Years until the accumulated value covers `price`, interpolated. */
function paybackFromValues(values: readonly number[], price: number): number | null {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    const yearValue = values[i] ?? 0;
    if (total + yearValue >= price) {
      return yearValue > 0 ? i + (price - total) / yearValue : i + 1;
    }
    total += yearValue;
  }
  const last = values[values.length - 1] ?? 0;
  return last > 0 ? values.length + (price - total) / last : null;
}

export function calculateMaxInvestment(
  annualEconomicValue: number,
  acceptedPaybackYears: number,
  quotePrice?: number | null,
  /**
   * Year-by-year economic value (year 1 first). When given, the accumulated
   * value over the accepted payback time is used instead of a flat
   * value x years, so the electricity price scenario is reflected.
   */
  annualValues?: readonly number[] | null,
): MaxInvestmentResult {
  const safeValue = Number.isFinite(annualEconomicValue) ? Math.max(0, annualEconomicValue) : 0;
  const safeYears = Number.isFinite(acceptedPaybackYears) ? Math.max(0, acceptedPaybackYears) : 0;
  const values = annualValues?.filter((v) => Number.isFinite(v)) ?? null;
  const maxInvestment =
    values && values.length > 0
      ? accumulate(values, safeYears)
      : safeValue * safeYears;
  const safeQuote =
    quotePrice != null && Number.isFinite(quotePrice) && quotePrice > 0 ? quotePrice : null;

  return {
    annualEconomicValue: safeValue,
    acceptedPaybackYears: safeYears,
    maxInvestment,
    maxInvestmentRounded: roundForConsumer(maxInvestment),
    quotePrice: safeQuote,
    quotePaybackYears:
      safeQuote === null
        ? null
        : values && values.length > 0
          ? paybackFromValues(values, safeQuote)
          : safeValue > 0
            ? safeQuote / safeValue
            : null,
    method: "simple",
  };
}
