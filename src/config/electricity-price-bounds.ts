/**
 * Plausibility bounds for user-entered electricity prices.
 *
 * Why this exists: the price fields are free text in the user's own currency,
 * and a slip of the hand ("144" instead of "1,44") silently produces a max
 * investment that is 100x too high but still looks like a normal number.
 * A hard, currency-aware ceiling makes that mistake visible instead.
 *
 * How the ceiling is derived (deterministic, no guessing):
 *  - Every currency that has at least one verified country default gets a
 *    scale = the highest verified purchased price in that currency.
 *  - The ceiling is that scale x PRICE_SANITY_FACTOR. A factor of 25 leaves
 *    room for extreme tariffs, island grids and future price shocks while
 *    still catching decimal/unit errors, which are off by 100x or more.
 *  - Currencies with no verified default have NO ceiling (null). We refuse to
 *    invent a magnitude for a currency we have never priced.
 */

import { currencyForCountryCode, type CurrencyCode } from "./currencies";
import { ELECTRICITY_PRICE_DEFAULTS } from "./electricity-price-defaults";

/** How many times the highest verified price in a currency is still allowed. */
export const PRICE_SANITY_FACTOR = 25;

/** Highest verified purchased price per kWh, per currency. */
const SCALE_BY_CURRENCY: Record<CurrencyCode, number> = (() => {
  const scale: Record<CurrencyCode, number> = {};
  for (const [code, prices] of Object.entries(ELECTRICITY_PRICE_DEFAULTS)) {
    const currency = currencyForCountryCode(code);
    const highest = Math.max(prices.selfConsumed, prices.exported);
    scale[currency] = Math.max(scale[currency] ?? 0, highest);
  }
  return scale;
})();

/**
 * Upper plausibility bound for a price per kWh in this country's currency.
 * Returns null when the currency has no verified magnitude to reason from.
 */
export function maxPlausiblePricePerKwh(countryCode?: string | null): number | null {
  const currency = currencyForCountryCode((countryCode ?? "").toUpperCase());
  const scale = SCALE_BY_CURRENCY[currency];
  if (scale === undefined || !Number.isFinite(scale) || scale <= 0) return null;
  return scale * PRICE_SANITY_FACTOR;
}

/** True when the value is above the country's plausibility ceiling. */
export function isImplausiblePricePerKwh(
  value: number,
  countryCode?: string | null,
): boolean {
  const max = maxPlausiblePricePerKwh(countryCode);
  if (max === null) return false;
  return value > max;
}
