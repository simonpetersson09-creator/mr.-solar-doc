import { EU_THREE_PHASE_KW_PER_AMP } from "./constants";

export type GridConnectionType = "eu-three-phase-400v";

export interface MarketConfig {
  /** ISO 3166-1 alpha-2 country code. */
  countryCode: string;
  locale: string;
  currency: string;
  /** Assumed future electricity price, per kWh, in `currency`. */
  defaultElectricityPricePerKwh: number;
  gridConnectionType: GridConnectionType;
  /** kW allowed per ampere for this market's standard connection. */
  kwPerAmp: number;
  /** Selectable main fuse sizes (A). */
  mainFuseOptionsAmp: number[];
  /** Commercially available inverter sizes (kW AC). */
  inverterSizesKw: number[];
}

const EU_INVERTER_SIZES_KW = [3, 4, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30];
const EU_MAIN_FUSE_OPTIONS_AMP = [16, 20, 25, 32, 35, 40, 50, 63];

const baseEuMarket = {
  gridConnectionType: "eu-three-phase-400v" as const,
  kwPerAmp: EU_THREE_PHASE_KW_PER_AMP,
  mainFuseOptionsAmp: EU_MAIN_FUSE_OPTIONS_AMP,
  inverterSizesKw: EU_INVERTER_SIZES_KW,
};

export const MARKETS: Record<string, MarketConfig> = {
  SE: {
    ...baseEuMarket,
    countryCode: "SE",
    locale: "sv-SE",
    currency: "SEK",
    defaultElectricityPricePerKwh: 0.6,
  },
  NO: {
    ...baseEuMarket,
    countryCode: "NO",
    locale: "nb-NO",
    currency: "NOK",
    defaultElectricityPricePerKwh: 0.9,
  },
  FI: {
    ...baseEuMarket,
    countryCode: "FI",
    locale: "fi-FI",
    currency: "EUR",
    defaultElectricityPricePerKwh: 0.12,
  },
  DK: {
    ...baseEuMarket,
    countryCode: "DK",
    locale: "da-DK",
    currency: "DKK",
    defaultElectricityPricePerKwh: 1.5,
  },
  DE: {
    ...baseEuMarket,
    countryCode: "DE",
    locale: "de-DE",
    currency: "EUR",
    defaultElectricityPricePerKwh: 0.3,
  },
  NL: {
    ...baseEuMarket,
    countryCode: "NL",
    locale: "nl-NL",
    currency: "EUR",
    defaultElectricityPricePerKwh: 0.3,
  },
};

export const FALLBACK_MARKET_CODE = "SE";

export function getMarketConfig(countryCode?: string | null): MarketConfig {
  const code = (countryCode ?? "").toUpperCase();
  return MARKETS[code] ?? MARKETS[FALLBACK_MARKET_CODE]!;
}
