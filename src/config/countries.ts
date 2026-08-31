/**
 * Country configuration layer.
 *
 * Rule of thumb for the whole app:
 *  - COUNTRY decides economics, currency and grid/technical defaults.
 *  - LOCALE decides text and presentation.
 *  - COORDINATES decide geographical assumptions (see `@/lib/geo/hemisphere`).
 *
 * The calculation engine must never contain country-specific numbers. It reads
 * normalised numeric values that this layer (or the user) supplies.
 */

import { getMarketConfig, MARKETS, type MarketConfig } from "./markets";
import { PHASE_COUNT_FOR_SERVICE_TYPE } from "./grid";
import { getConnectionConfig, type CountryConnectionConfig } from "./connections";

/** ISO 4217 currency code, e.g. "SEK", "EUR". */
export type CurrencyCode = string;

/**
 * ISO 4217 "no currency" code. Used when we cannot determine the country's
 * currency — never guess SEK (or any other real currency) for an unknown
 * country; showing a neutral code is honest and cannot mislead.
 */
export const NEUTRAL_CURRENCY_CODE = "XXX";

/**
 * Currencies for countries we may see from the address but that have no
 * verified market config. Currency is a fact, not an economic assumption, so
 * it is safe to know it without claiming to know prices.
 */
export const CURRENCY_BY_COUNTRY: Record<string, CurrencyCode> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  NO: "NOK",
  IS: "ISK",
  JP: "JPY",
  CH: "CHF",
  SE: "SEK",
  DK: "DKK",
  CZ: "CZK",
  PL: "PLN",
  HU: "HUF",
  RO: "RON",
  BG: "BGN",
  IE: "EUR",
  NL: "EUR",
  BE: "EUR",
  ES: "EUR",
  PT: "EUR",
  FR: "EUR",
  IT: "EUR",
  GR: "EUR",
  BR: "BRL",
  IN: "INR",
  ZA: "ZAR",
};

/** Currency for a country, or the neutral code when it cannot be determined. */
export function currencyForCountry(countryCode?: string | null): CurrencyCode {
  const code = (countryCode ?? "").toUpperCase();
  return MARKETS[code]?.currency ?? CURRENCY_BY_COUNTRY[code] ?? NEUTRAL_CURRENCY_CODE;
}

/** How a monetary default was obtained. Never hidden from the UI. */
export type EconomicValueOrigin = "verified" | "missing";

export interface MonetaryDefault {
  /** Value in the country's currency, or null when we have no verified value. */
  value: number | null;
  origin: EconomicValueOrigin;
  /** Unit of the value, e.g. "currency/kWh" or "currency/kWp". */
  unit: "currency/kWh" | "currency/kWp" | "currency";
}

/**
 * Support / tax rules. Deliberately a small set of composable shapes so a new
 * country can be added without touching the calculation engine.
 */
export type IncentiveRule =
  | { id: string; kind: "percent-of-investment"; percent: number; maxAmount?: number }
  | { id: string; kind: "fixed-amount"; amount: number }
  | { id: string; kind: "per-kwp"; amountPerKwp: number; maxKwp?: number }
  | { id: string; kind: "tax-reduction"; percent: number; maxAmount?: number }
  | { id: string; kind: "export-compensation"; amountPerKwh: number };

export interface Incentive {
  rule: IncentiveRule;
  /**
   * Only enabled incentives are applied or shown. Rules we have not verified
   * stay disabled — the architecture exists, the claim does not.
   */
  enabled: boolean;
  /** Free-text note for maintainers. Never shown to the user. */
  note?: string;
}

export interface GridCompensationConfig {
  /**
   * Whether a grid-benefit / network compensation component exists in this
   * country at all. When false the item must not be calculated, and must not
   * be shown in the result.
   */
  enabled: boolean;
  defaultValuePerKwh: MonetaryDefault;
}

export interface CountryEconomics {
  currencyCode: CurrencyCode;
  electricity: {
    /** Value of one kWh the household does not have to buy. */
    selfConsumedValuePerKwh: MonetaryDefault;
    /** Compensation for one kWh exported to the grid. */
    exportPricePerKwh: MonetaryDefault;
  };
  gridCompensation: GridCompensationConfig;
  incentives: Incentive[];
  installation: {
    /** Typical turnkey installation cost per kWp. */
    defaultCostPerKwp: MonetaryDefault;
  };
  /** False when the country has no verified electricity defaults at all. */
  hasVerifiedDefaults: boolean;
}

export interface CountryConfig {
  countryCode: string;
  /** Grid / fuse assumptions (unchanged, verified logic). */
  grid: Pick<MarketConfig, "gridVoltageV" | "gridPhases" | "kwPerAmp" | "mainFuseOptionsAmp">;
  connection: CountryConnectionConfig;
  economics: CountryEconomics;
  localization: {
    /** Fallback locale only. The active locale follows the chosen language. */
    defaultLocale: string;
  };
}

function money(
  value: number | null,
  unit: MonetaryDefault["unit"] = "currency/kWh",
): MonetaryDefault {
  return { value, origin: value === null ? "missing" : "verified", unit };
}

/** Country-specific economics that are NOT derivable from the market config. */
interface EconomicsOverride {
  gridCompensation?: Partial<GridCompensationConfig>;
  incentives?: Incentive[];
  installationCostPerKwp?: number | null;
}

const ECONOMICS_OVERRIDES: Record<string, EconomicsOverride> = {
  SE: {
    // Sweden has an established grid-benefit component; the level is set by the
    // local grid operator, so there is no national standard value.
    gridCompensation: { enabled: true, defaultValuePerKwh: money(null) },
    installationCostPerKwp: 15000,
    incentives: [
      {
        rule: { id: "se-green-tech", kind: "tax-reduction", percent: 0.2, maxAmount: 50000 },
        // Kept disabled: not part of the current verified Swedish calculation.
        enabled: false,
        note: "Grön teknik. Verify current percentage and cap before enabling.",
      },
    ],
  },
};

function buildEconomics(market: MarketConfig): CountryEconomics {
  const override = ECONOMICS_OVERRIDES[market.countryCode] ?? {};
  const selfConsumed = money(market.selfConsumedElectricityValue);
  const exported = money(market.exportElectricityValue);
  return {
    currencyCode: market.currency,
    electricity: {
      selfConsumedValuePerKwh: selfConsumed,
      exportPricePerKwh: exported,
    },
    gridCompensation: {
      enabled: override.gridCompensation?.enabled ?? false,
      defaultValuePerKwh: override.gridCompensation?.defaultValuePerKwh ?? money(null),
    },
    incentives: override.incentives ?? [],
    installation: {
      defaultCostPerKwp: money(override.installationCostPerKwp ?? null, "currency/kWp"),
    },
    hasVerifiedDefaults:
      selfConsumed.origin === "verified" && exported.origin === "verified",
  };
}

function buildCountry(market: MarketConfig): CountryConfig {
  return {
    countryCode: market.countryCode,
    grid: {
      gridVoltageV: market.gridVoltageV,
      gridPhases: market.gridPhases,
      kwPerAmp: market.kwPerAmp,
      mainFuseOptionsAmp: market.mainFuseOptionsAmp,
    },
    connection: getConnectionConfig(market.countryCode),
    economics: buildEconomics(market),
    localization: { defaultLocale: market.locale },
  };
}

export const COUNTRIES: Record<string, CountryConfig> = Object.fromEntries(
  Object.values(MARKETS).map((market) => [market.countryCode, buildCountry(market)]),
);

/**
 * Country config for an ISO country code. Unknown countries fall back to the
 * market fallback for grid/technical defaults, but their economics are
 * explicitly marked as missing — Swedish prices are never presented as local.
 */
export function getCountryConfig(countryCode?: string | null): CountryConfig {
  const code = (countryCode ?? "").toUpperCase();
  const known = COUNTRIES[code];
  if (known) return known;

  const fallback = buildCountry(getMarketConfig(code));
  const connection = getConnectionConfig(code);
  return {
    ...fallback,
    countryCode: code || fallback.countryCode,
    connection,
    grid: {
      ...fallback.grid,
      gridVoltageV: connection.defaultVoltage,
      gridPhases: PHASE_COUNT_FOR_SERVICE_TYPE[connection.defaultServiceType],
      // Ampere options only; kVA/kW markets are not expressible here.
      mainFuseOptionsAmp: connection.connectionOptions.flatMap((option) =>
        option.capacity.type === "amperage" ? [option.capacity.amperageA] : [],
      ),
    },
    economics: {
      ...fallback.economics,
      // Currency is a verifiable fact; prices are not. Never assume SEK.
      currencyCode: currencyForCountry(code),
      electricity: {
        selfConsumedValuePerKwh: money(null),
        exportPricePerKwh: money(null),
      },
      gridCompensation: { enabled: false, defaultValuePerKwh: money(null) },
      incentives: [],
      installation: { defaultCostPerKwp: money(null, "currency/kWp") },
      hasVerifiedDefaults: false,
    },
  };
}

export function getCurrencyCode(countryCode?: string | null): CurrencyCode {
  return getCountryConfig(countryCode).economics.currencyCode;
}

/** True when the grid-benefit item may be calculated and shown for a country. */
export function isGridCompensationAvailable(countryCode?: string | null): boolean {
  return getCountryConfig(countryCode).economics.gridCompensation.enabled;
}

export interface ResolvedEconomicsDefaults {
  currencyCode: CurrencyCode;
  selfConsumedValuePerKwh: number | null;
  exportValuePerKwh: number | null;
  gridCompensationPerKwh: number | null;
  installationCostPerKwp: number | null;
  /** True when the user must supply the prices themselves. */
  valuesMissing: boolean;
}

/**
 * Resolves the numbers the calculation layer needs. User overrides always win;
 * a missing country default stays null rather than borrowing another country's.
 */
export function resolveEconomicsDefaults(
  countryCode: string | null | undefined,
  overrides: {
    selfConsumedValuePerKwh?: number | null;
    exportValuePerKwh?: number | null;
    gridCompensationPerKwh?: number | null;
    installationCostPerKwp?: number | null;
  } = {},
): ResolvedEconomicsDefaults {
  const economics = getCountryConfig(countryCode).economics;
  const selfConsumed =
    overrides.selfConsumedValuePerKwh ?? economics.electricity.selfConsumedValuePerKwh.value;
  const exported =
    overrides.exportValuePerKwh ?? economics.electricity.exportPricePerKwh.value;
  const gridCompensation = economics.gridCompensation.enabled
    ? (overrides.gridCompensationPerKwh ?? economics.gridCompensation.defaultValuePerKwh.value)
    : null;

  return {
    currencyCode: economics.currencyCode,
    selfConsumedValuePerKwh: selfConsumed,
    exportValuePerKwh: exported,
    gridCompensationPerKwh: gridCompensation,
    installationCostPerKwp:
      overrides.installationCostPerKwp ?? economics.installation.defaultCostPerKwp.value,
    valuesMissing: selfConsumed === null || exported === null,
  };
}

/** Applies enabled incentive rules to an investment. Pure and country-agnostic. */
export function calculateIncentives(params: {
  countryCode?: string | null;
  investmentAmount: number;
  installedKwp: number;
}): { totalAmount: number; applied: string[] } {
  const incentives = getCountryConfig(params.countryCode).economics.incentives;
  let total = 0;
  const applied: string[] = [];
  for (const incentive of incentives) {
    if (!incentive.enabled) continue;
    const rule = incentive.rule;
    let amount = 0;
    switch (rule.kind) {
      case "percent-of-investment":
      case "tax-reduction":
        amount = Math.min(
          params.investmentAmount * rule.percent,
          rule.maxAmount ?? Number.POSITIVE_INFINITY,
        );
        break;
      case "fixed-amount":
        amount = rule.amount;
        break;
      case "per-kwp":
        amount = Math.min(params.installedKwp, rule.maxKwp ?? params.installedKwp) *
          rule.amountPerKwp;
        break;
      case "export-compensation":
        // Handled as an electricity component, not an up-front amount.
        amount = 0;
        break;
    }
    if (amount > 0) {
      total += amount;
      applied.push(rule.id);
    }
  }
  return { totalAmount: total, applied };
}
