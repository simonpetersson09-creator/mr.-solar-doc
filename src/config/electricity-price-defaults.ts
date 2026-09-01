/**
 * Country electricity price defaults ("schablonvärden").
 *
 * These are EDITABLE starting assumptions, never guaranteed tariffs:
 *  - `selfConsumed` = average cost of one purchased kWh (incl. grid + taxes).
 *  - `exported`     = ESTIMATED compensation for one exported kWh. Actual
 *                     compensation varies by contract, region and support
 *                     schemes.
 *
 * Values are expressed in the country's own currency (see `./currencies`).
 * Countries not listed here have no defaults at all — the user enters them.
 *
 * This layer only supplies numbers. Grid profiles, dimensioning and the
 * self-consumption model are unaffected by it.
 */

import { currencyForCountryCode, type CurrencyCode } from "./currencies";

export interface ElectricityPriceDefault {
  /** Average cost per purchased kWh, in the country's currency. */
  selfConsumed: number;
  /** Estimated compensation per exported kWh, in the country's currency. */
  exported: number;
}

/** Bump when the standard values below are revised. Internal only. */
export const ELECTRICITY_PRICE_DEFAULTS_REVISION = "2026-09";

export const ELECTRICITY_PRICE_DEFAULTS: Record<string, ElectricityPriceDefault> = {
  SE: { selfConsumed: 1.5, exported: 0.5 },
  FI: { selfConsumed: 0.18, exported: 0.05 },
  DK: { selfConsumed: 2.8, exported: 0.35 },
  DE: { selfConsumed: 0.35, exported: 0.08 },
  AT: { selfConsumed: 0.35, exported: 0.06 },
  CZ: { selfConsumed: 7.5, exported: 1.3 },
  PL: { selfConsumed: 0.95, exported: 0.25 },
  SK: { selfConsumed: 0.2, exported: 0.05 },
  SI: { selfConsumed: 0.2, exported: 0.05 },
  EE: { selfConsumed: 0.23, exported: 0.05 },
  LV: { selfConsumed: 0.24, exported: 0.05 },
  LT: { selfConsumed: 0.24, exported: 0.05 },
  CH: { selfConsumed: 0.31, exported: 0.07 },
  NO: { selfConsumed: 1.95, exported: 0.5 },
  NL: { selfConsumed: 0.28, exported: 0.08 },
  GB: { selfConsumed: 0.3, exported: 0.08 },
  BE: { selfConsumed: 0.35, exported: 0.06 },
  FR: { selfConsumed: 0.24, exported: 0.04 },
  PT: { selfConsumed: 0.22, exported: 0.06 },
  ES: { selfConsumed: 0.23, exported: 0.06 },
  IT: { selfConsumed: 0.35, exported: 0.07 },
  IE: { selfConsumed: 0.38, exported: 0.15 },
  HR: { selfConsumed: 0.16, exported: 0.06 },
  HU: { selfConsumed: 40, exported: 15 },
  RO: { selfConsumed: 0.95, exported: 0.25 },
  GR: { selfConsumed: 0.22, exported: 0.07 },
  BG: { selfConsumed: 0.14, exported: 0.05 },
  RS: { selfConsumed: 14, exported: 5 },
  TR: { selfConsumed: 2.8, exported: 1.2 },
  IS: { selfConsumed: 23, exported: 8 },
  LU: { selfConsumed: 0.23, exported: 0.08 },
  MT: { selfConsumed: 0.13, exported: 0.1 },
  CY: { selfConsumed: 0.3, exported: 0.1 },
  MK: { selfConsumed: 7.0, exported: 3.0 },
  AL: { selfConsumed: 10, exported: 5 },
  BA: { selfConsumed: 0.18, exported: 0.08 },
  ME: { selfConsumed: 0.11, exported: 0.05 },
  NZ: { selfConsumed: 0.38, exported: 0.13 },
  IL: { selfConsumed: 0.67, exported: 0.2 },
  MX: { selfConsumed: 1.9, exported: 0.8 },
  US: { selfConsumed: 0.18, exported: 0.07 },
  CA: { selfConsumed: 0.17, exported: 0.07 },
  JP: { selfConsumed: 35, exported: 16 },
};

/** Country codes that ship with electricity price defaults. */
export const COUNTRIES_WITH_PRICE_DEFAULTS = Object.keys(ELECTRICITY_PRICE_DEFAULTS);

export function getElectricityPriceDefaults(
  countryCode?: string | null,
): ElectricityPriceDefault | null {
  const code = (countryCode ?? "").toUpperCase();
  return ELECTRICITY_PRICE_DEFAULTS[code] ?? null;
}

/** Currency the defaults above are expressed in. */
export function priceDefaultsCurrency(countryCode?: string | null): CurrencyCode {
  return currencyForCountryCode((countryCode ?? "").toUpperCase());
}
