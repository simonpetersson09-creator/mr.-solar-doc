import {
  CONSUMPTION_SHAPE_WEIGHTS,
  EU_GRID_PHASES,
  EU_GRID_VOLTAGE_V,
  EU_THREE_PHASE_KW_PER_AMP,
} from "./constants";
import type { SupportedLanguage } from "@/i18n/languages";
import { getConnectionConfig } from "./connections";

export type GridConnectionType =
  | "eu-three-phase-400v"
  | "eu-single-phase-230v"
  | "eu-three-phase-230v"
  | "split-phase-120-240v"
  | "split-phase-100-200v";

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
   * Standard calculation value ("schablonvärde") for one self-consumed kWh, in
   * `currency`. Not a national electricity price, tariff or guaranteed level —
   * it is a starting assumption the user can replace.
   * `null` when no standard value exists — the user must enter it.
   */
  selfConsumedElectricityValue: number | null;
  /**
   * Standard calculation value ("schablonvärde") for one exported kWh, in
   * `currency`. Not a guaranteed compensation level.
   * `null` when no standard value exists — the user must enter it.
   */
  exportElectricityValue: number | null;
  gridConnectionType: GridConnectionType;
  /** Assumed grid voltage (V) behind the fuse calculation. */
  gridVoltageV: number;
  /** Assumed number of phases behind the fuse calculation. */
  gridPhases: number;
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

/**
 * Commercially available string-inverter sizes (kW AC).
 *
 * The ladder mirrors real residential/commercial product classes (e.g. 3.6 /
 * 4.6 / 17 kW single- and three-phase units), not arbitrary design steps. The
 * sizes above 30 kW are equally real three-phase products and are included so
 * markets whose connection or PV rules permit more than 30 kW AC (for example
 * a 43.5 kW ceiling) can actually use their allowance. The engine never picks
 * an inverter above the AC ceiling, so larger entries are inert elsewhere.
 */
const EU_INVERTER_SIZES_KW = [
  1.5, 2, 2.5, 3, 3.6, 4, 4.6, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30, 33, 36, 40, 50, 60,
];
const EU_MAIN_FUSE_OPTIONS_AMP = [16, 20, 25, 32, 35, 40, 50, 63];

const baseEuMarket = {
  gridConnectionType: "eu-three-phase-400v" as const,
  gridVoltageV: EU_GRID_VOLTAGE_V,
  gridPhases: EU_GRID_PHASES,
  kwPerAmp: EU_THREE_PHASE_KW_PER_AMP,
  mainFuseOptionsAmp: EU_MAIN_FUSE_OPTIONS_AMP,
  inverterSizesKw: EU_INVERTER_SIZES_KW,
  defaultConsumptionWeights: [...CONSUMPTION_SHAPE_WEIGHTS.default],
  selfConsumedElectricityValue: null,
  exportElectricityValue: null,
};

/** Technical grid presets for markets that are not 3N~400 V. */
const singlePhase230: Partial<MarketConfig> = {
  gridConnectionType: "eu-single-phase-230v",
  gridVoltageV: 230,
  gridPhases: 1,
  kwPerAmp: 0.23,
};
const threePhase230: Partial<MarketConfig> = {
  gridConnectionType: "eu-three-phase-230v",
  gridVoltageV: 230,
  gridPhases: 3,
  kwPerAmp: (Math.sqrt(3) * 230) / 1000,
};
const splitPhase240: Partial<MarketConfig> = {
  gridConnectionType: "split-phase-120-240v",
  gridVoltageV: 240,
  gridPhases: 1,
  kwPerAmp: 0.24,
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

/**
 * Version of the standard electricity values below. Bump when the schablon
 * values are revised. Internal only — not shown to the user.
 */
export const ELECTRICITY_PRICE_DEFAULTS_VERSION = "2026-08";

/** Standard values per market: [self-consumed, exported] in market currency. */
function prices(selfConsumed: number, exported: number): Partial<MarketConfig> {
  return {
    selfConsumedElectricityValue: selfConsumed,
    exportElectricityValue: exported,
  };
}

export const MARKETS: Record<string, MarketConfig> = {
  SE: market("SE", "SEK", ["sv"], prices(1.5, 0.5)),
  FI: market("FI", "EUR", ["fi"], prices(0.15, 0.045)),
  DK: market("DK", "DKK", ["da"], prices(2.0, 0.35)),
  DE: market("DE", "EUR", ["de"], prices(0.3, 0.08)),
  AT: market("AT", "EUR", ["de"], prices(0.22, 0.055)),
  CZ: market("CZ", "CZK", ["cs"], prices(5.0, 1.3)),
  PL: market("PL", "PLN", ["pl"], prices(0.8, 0.25)),
  SK: market("SK", "EUR", ["sk"], prices(0.17, 0.05)),
  SI: market("SI", "EUR", ["sl"], prices(0.18, 0.05)),
  EE: market("EE", "EUR", ["et"], prices(0.18, 0.05)),
  LV: market("LV", "EUR", ["lv"], prices(0.18, 0.05)),
  LT: market("LT", "EUR", ["lt"], prices(0.19, 0.05)),
  /** Switzerland: the user picks the language separately; currency stays CHF. */
  CH: market("CH", "CHF", ["de", "fr", "it"], prices(0.22, 0.07)),
  /**
   * Markets with a verified connection profile but outside the launch list.
   * They get their own technical defaults so nothing silently borrows the
   * Swedish grid model or fuse ladder.
   */
  NO: market("NO", "NOK", ["no"], {
    ...threePhase230,
    mainFuseOptionsAmp: [25, 32, 40, 63],
  }),
  NL: market("NL", "EUR", ["nl"], {
    mainFuseOptionsAmp: [25, 35, 50, 63, 80],
  }),
  GB: market("GB", "GBP", ["en"], {
    ...singlePhase230,
    mainFuseOptionsAmp: [60, 80, 100],
  }),
  BE: market("BE", "EUR", ["nl", "fr"], {
    mainFuseOptionsAmp: [25, 32, 40, 63],
  }),
  FR: market("FR", "EUR", ["fr"], {
    ...singlePhase230,
    mainFuseOptionsAmp: [25, 32, 40, 63],
  }),
  PT: market("PT", "EUR", ["pt"], {
    ...singlePhase230,
    mainFuseOptionsAmp: [20, 25, 32, 40, 50, 63],
  }),
  ES: market("ES", "EUR", ["es"], {
    ...singlePhase230,
    mainFuseOptionsAmp: [20, 25, 32, 40, 50, 63],
  }),
  IT: market("IT", "EUR", ["it"], {
    ...singlePhase230,
    mainFuseOptionsAmp: [16, 20, 25, 32, 40, 50],
  }),
  US: market("US", "USD", ["en"], {
    ...splitPhase240,
    mainFuseOptionsAmp: [60, 100, 150, 200, 400],
  }),
  CA: market("CA", "CAD", ["en"], {
    ...splitPhase240,
    mainFuseOptionsAmp: [100, 200, 400],
  }),
  JP: market("JP", "JPY", ["en"], {
    gridConnectionType: "split-phase-100-200v",
    gridVoltageV: 200,
    gridPhases: 1,
    kwPerAmp: 0.2,
    mainFuseOptionsAmp: [10, 15, 20, 30, 40, 50, 60],
  }),
};

/** The 13 countries Mr. Solar Doc actively supports. */
export const ACTIVE_MARKET_CODES = [
  "SE",
  "FI",
  "DK",
  "DE",
  "AT",
  "CZ",
  "PL",
  "SK",
  "SI",
  "EE",
  "LV",
  "LT",
  "CH",
] as const;

export const FALLBACK_MARKET_CODE = "SE";

export function isActiveMarket(countryCode?: string | null): boolean {
  const code = (countryCode ?? "").toUpperCase();
  return (ACTIVE_MARKET_CODES as readonly string[]).includes(code);
}

/**
 * True when the given country has no market configuration of its own and would
 * silently fall back to the Swedish one (SEK + Swedish standard values).
 */
export function isFallbackMarket(countryCode?: string | null): boolean {
  const code = (countryCode ?? "").toUpperCase();
  return MARKETS[code] === undefined;
}

const warnedMarkets = new Set<string>();

export function getMarketConfig(countryCode?: string | null): MarketConfig {
  const code = (countryCode ?? "").toUpperCase();
  const config = MARKETS[code];
  if (config) return config;
  // Countries with their own connection profile (verified or generic) get
  // correct grid data and a currency of their own via `@/config/countries`;
  // only the technical EU defaults are borrowed, so no warning is warranted.
  const hasOwnConnectionProfile = getConnectionConfig(code).status !== "unsupported";
  if (import.meta.env.DEV && code !== "" && !hasOwnConnectionProfile && !warnedMarkets.has(code)) {
    warnedMarkets.add(code);
    console.warn(
      `[markets] No configuration for "${code}" - falling back to ${FALLBACK_MARKET_CODE}. ` +
        "Currency and standard values shown will not match this country.",
    );
  }
  return MARKETS[FALLBACK_MARKET_CODE]!;
}

/**
 * Currency is NOT resolved here on purpose. `getMarketConfig` falls back to
 * the Swedish market for unknown countries, so deriving currency from it would
 * silently label a US or Japanese result as SEK. The single source of truth is
 * `currencyForCountry` / `getCurrencyCode` in `@/config/countries`.
 */

