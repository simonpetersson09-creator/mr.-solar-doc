import { CONSUMPTION_SHAPE_WEIGHTS, EU_THREE_PHASE_KW_PER_AMP } from "./constants";
import type { SupportedLanguage } from "@/i18n/languages";

export type GridConnectionType = "eu-three-phase-400v";

export interface MarketConfig {
  /** ISO 3166-1 alpha-2 country code. */
  countryCode: string;
  /**
   * Fallback BCP47 locale for the market. Used only when no language is
   * chosen; the active locale is normally `${language}-${countryCode}`.
   */
  locale: string;
  /**
   * ISO 4217 currency for the market. Determined by COUNTRY only — never by
   * the chosen language (a German-speaking user in Switzerland gets CHF).
   */
  currency: string;
  /** Language pre-selected when the user picks this country. */
  defaultLanguage: SupportedLanguage;
  /** Official languages the user may pick for this market (first = default). */
  languageOptions: SupportedLanguage[];
  /**
   * Calculation assumption: value of one self-consumed kWh, in `currency`.
   * `null` when no verified national default exists — the user must enter it.
   */
  selfConsumedElectricityValue: number | null;
  /**
   * Calculation assumption: compensation for one exported kWh, in `currency`.
   * `null` when no verified national default exists — the user must enter it.
   */
  exportElectricityValue: number | null;
  gridConnectionType: GridConnectionType;
  /** kW allowed per ampere for this market's standard connection. */
  kwPerAmp: number;
  /** Selectable main fuse sizes (A). */
  mainFuseOptionsAmp: number[];
  /** Commercially available inverter sizes (kW AC). */
  inverterSizesKw: number[];
  /**
   * Neutral monthly consumption weights (Jan..Dec) used when the user picks
   * "I don't know". Normalised before use, so relative values are enough.
   */
  defaultConsumptionWeights: number[];
}

const EU_INVERTER_SIZES_KW = [
  1.5, 2, 2.5, 3, 3.6, 4, 4.6, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30,
];
const EU_MAIN_FUSE_OPTIONS_AMP = [16, 20, 25, 32, 35, 40, 50, 63];

const baseEuMarket = {
  gridConnectionType: "eu-three-phase-400v" as const,
  kwPerAmp: EU_THREE_PHASE_KW_PER_AMP,
  mainFuseOptionsAmp: EU_MAIN_FUSE_OPTIONS_AMP,
  inverterSizesKw: EU_INVERTER_SIZES_KW,
  defaultConsumptionWeights: [...CONSUMPTION_SHAPE_WEIGHTS.default],
  selfConsumedElectricityValue: null,
  exportElectricityValue: null,
};

function market(
  countryCode: string,
  currency: string,
  languageOptions: SupportedLanguage[],
  overrides: Partial<MarketConfig> = {},
): MarketConfig {
  const defaultLanguage = languageOptions[0] ?? "en";
  return {
    ...baseEuMarket,
    countryCode,
    currency,
    languageOptions,
    defaultLanguage,
    locale: `${defaultLanguage}-${countryCode}`,
    ...overrides,
  };
}

export const MARKETS: Record<string, MarketConfig> = {
  SE: market("SE", "SEK", ["sv"], {
    selfConsumedElectricityValue: 1.5,
    exportElectricityValue: 0.6,
  }),
  FI: market("FI", "EUR", ["fi"]),
  DK: market("DK", "DKK", ["da"]),
  DE: market("DE", "EUR", ["de"]),
  AT: market("AT", "EUR", ["de"]),
  CZ: market("CZ", "CZK", ["cs"]),
  PL: market("PL", "PLN", ["pl"]),
  SK: market("SK", "EUR", ["sk"]),
  SI: market("SI", "EUR", ["sl"]),
  HR: market("HR", "EUR", ["hr"]),
  EE: market("EE", "EUR", ["et"]),
  LV: market("LV", "EUR", ["lv"]),
  LT: market("LT", "EUR", ["lt"]),
  /** Switzerland: the user picks the language separately; currency stays CHF. */
  CH: market("CH", "CHF", ["de", "fr", "it"]),
  /** Neighbouring markets kept for address results outside the launch list. */
  NO: market("NO", "NOK", ["en"]),
  NL: market("NL", "EUR", ["en"]),
};

export const FALLBACK_MARKET_CODE = "SE";

export function getMarketConfig(countryCode?: string | null): MarketConfig {
  const code = (countryCode ?? "").toUpperCase();
  return MARKETS[code] ?? MARKETS[FALLBACK_MARKET_CODE]!;
}

/** Country -> currency. Never derived from the chosen language. */
export function getCurrencyForCountry(countryCode?: string | null): string {
  return getMarketConfig(countryCode).currency;
}
