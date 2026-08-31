/**
 * Global country -> currency metadata.
 *
 * Scope of this file: ISO 3166-1 alpha-2 country/territory code -> ISO 4217
 * currency code. Nothing else. Knowing a country's currency says NOTHING about
 * its electricity prices, export compensation or grid benefit — those live in
 * `@/config/markets` / `@/config/countries` economics and stay `null` until a
 * value is verified or the user enters one.
 *
 * Multi-currency policy (deterministic, documented):
 *  1. Use the country's own legal tender when there is exactly one.
 *  2. When a country/territory officially uses another state's currency
 *     (dollarised or euroised economies, dependent territories), use that
 *     currency — it is the currency a household actually pays its power bill
 *     in (e.g. EC -> USD, SV -> USD, PA -> USD, ME -> EUR, XK -> EUR).
 *  3. When a territory has both a local pegged currency and the metropolitan
 *     currency in daily use, prefer the LOCAL legal tender that appears on
 *     consumer bills (e.g. FO -> DKK is the legal tender, GI -> GIP, FK -> FKP).
 *  4. When two or more currencies circulate as legal tender with no stable
 *     default for a household bill, do NOT guess. The code goes in
 *     `AMBIGUOUS_CURRENCY_COUNTRIES` and resolves to the neutral code `XXX`,
 *     which makes the app ask the user instead of silently mispricing.
 *  5. Territories with no resident population / no consumer electricity market
 *     also resolve to `XXX`.
 */

/** ISO 4217 currency code, e.g. "SEK", "EUR". */
export type CurrencyCode = string;

/**
 * ISO 4217 "no currency" code. Used when the country is unknown, invalid, or
 * genuinely ambiguous — never guess a real currency in those cases.
 */
export const NEUTRAL_CURRENCY_CODE = "XXX";

/**
 * Countries/territories where no single household-billing currency can be
 * justified, or where there is no consumer market at all. These resolve to
 * `XXX` on purpose (rule 4 and 5 above) so the case is visible, not hidden.
 */
export const AMBIGUOUS_CURRENCY_COUNTRIES: Record<string, string> = {
  ZW: "Multi-currency regime (ZiG and USD both legal tender); no stable household default.",
  AQ: "Antarctica — no sovereign currency and no consumer electricity market.",
  BV: "Bouvet Island — uninhabited, no consumer electricity market.",
  HM: "Heard & McDonald Islands — uninhabited, no consumer electricity market.",
  GS: "South Georgia & South Sandwich Islands — no permanent population.",
  TF: "French Southern Territories — no permanent population.",
  UM: "US Minor Outlying Islands — no permanent civilian population.",
};

/**
 * ISO 3166-1 alpha-2 -> ISO 4217. Full global coverage; grouped by region only
 * for readability. Keep alphabetical inside each group.
 */
export const CURRENCY_BY_COUNTRY: Record<string, CurrencyCode> = {
  // ---- Europe: euro area and euro-using states/territories ----
  AD: "EUR",
  AT: "EUR",
  AX: "EUR",
  BE: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  HR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MC: "EUR",
  ME: "EUR", // Unilaterally euroised (rule 2).
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
  SM: "EUR",
  VA: "EUR",
  XK: "EUR", // Kosovo, unilaterally euroised (rule 2).
  // Euro-using French/Portuguese/Spanish overseas areas.
  BL: "EUR",
  GF: "EUR",
  GP: "EUR",
  MF: "EUR",
  MQ: "EUR",
  PM: "EUR",
  RE: "EUR",
  YT: "EUR",

  // ---- Europe: own currencies ----
  AL: "ALL",
  BA: "BAM",
  BG: "BGN",
  BY: "BYN",
  CH: "CHF",
  CZ: "CZK",
  DK: "DKK",
  FO: "DKK", // Faroese króna is a DKK issue; DKK is the ISO code (rule 3).
  GB: "GBP",
  GG: "GBP",
  GI: "GIP",
  HU: "HUF",
  IM: "GBP",
  IS: "ISK",
  JE: "GBP",
  LI: "CHF",
  MD: "MDL",
  MK: "MKD",
  NO: "NOK",
  PL: "PLN",
  RO: "RON",
  RS: "RSD",
  RU: "RUB",
  SE: "SEK",
  SJ: "NOK",
  UA: "UAH",

  // ---- Americas ----
  AG: "XCD",
  AI: "XCD",
  AR: "ARS",
  AW: "AWG",
  BB: "BBD",
  BM: "BMD",
  BO: "BOB",
  BQ: "USD", // Caribbean Netherlands, USD legal tender (rule 2).
  BR: "BRL",
  BS: "BSD",
  BZ: "BZD",
  CA: "CAD",
  CL: "CLP",
  CO: "COP",
  CR: "CRC",
  CU: "CUP",
  CW: "XCG",
  DM: "XCD",
  DO: "DOP",
  EC: "USD", // Dollarised (rule 2).
  FK: "FKP",
  GD: "XCD",
  GL: "DKK",
  GT: "GTQ",
  GY: "GYD",
  HN: "HNL",
  HT: "HTG",
  JM: "JMD",
  KN: "XCD",
  KY: "KYD",
  LC: "XCD",
  MS: "XCD",
  MX: "MXN",
  NI: "NIO",
  PA: "USD", // Balboa is pegged 1:1 and only issued as coins; bills are USD (rule 2).
  PE: "PEN",
  PR: "USD",
  PY: "PYG",
  SR: "SRD",
  SV: "USD", // Dollarised (rule 2).
  SX: "XCG",
  TC: "USD",
  TT: "TTD",
  US: "USD",
  UY: "UYU",
  VC: "XCD",
  VE: "VES",
  VG: "USD",
  VI: "USD",

  // ---- Africa ----
  AO: "AOA",
  BF: "XOF",
  BI: "BIF",
  BJ: "XOF",
  BW: "BWP",
  CD: "CDF",
  CF: "XAF",
  CG: "XAF",
  CI: "XOF",
  CM: "XAF",
  CV: "CVE",
  DJ: "DJF",
  DZ: "DZD",
  EG: "EGP",
  EH: "MAD",
  ER: "ERN",
  ET: "ETB",
  GA: "XAF",
  GH: "GHS",
  GM: "GMD",
  GN: "GNF",
  GQ: "XAF",
  GW: "XOF",
  KE: "KES",
  KM: "KMF",
  LR: "LRD",
  LS: "LSL",
  LY: "LYD",
  MA: "MAD",
  MG: "MGA",
  ML: "XOF",
  MR: "MRU",
  MU: "MUR",
  MW: "MWK",
  MZ: "MZN",
  NA: "NAD",
  NE: "XOF",
  NG: "NGN",
  RW: "RWF",
  SC: "SCR",
  SD: "SDG",
  SH: "SHP",
  SL: "SLE",
  SN: "XOF",
  SO: "SOS",
  SS: "SSP",
  ST: "STN",
  SZ: "SZL",
  TD: "XAF",
  TG: "XOF",
  TN: "TND",
  TZ: "TZS",
  UG: "UGX",
  ZA: "ZAR",
  ZM: "ZMW",

  // ---- Middle East & Central/South Asia ----
  AE: "AED",
  AF: "AFN",
  AM: "AMD",
  AZ: "AZN",
  BD: "BDT",
  BH: "BHD",
  BT: "BTN",
  GE: "GEL",
  IL: "ILS",
  IN: "INR",
  IQ: "IQD",
  IR: "IRR",
  JO: "JOD",
  KG: "KGS",
  KW: "KWD",
  KZ: "KZT",
  LB: "LBP",
  LK: "LKR",
  MV: "MVR",
  NP: "NPR",
  OM: "OMR",
  PK: "PKR",
  PS: "ILS", // Palestinian territories bill in ILS in practice (rule 2).
  QA: "QAR",
  SA: "SAR",
  SY: "SYP",
  TJ: "TJS",
  TM: "TMT",
  TR: "TRY",
  UZ: "UZS",
  YE: "YER",

  // ---- East & Southeast Asia ----
  BN: "BND",
  CN: "CNY",
  HK: "HKD",
  ID: "IDR",
  JP: "JPY",
  KH: "KHR",
  KP: "KPW",
  KR: "KRW",
  LA: "LAK",
  MM: "MMK",
  MN: "MNT",
  MO: "MOP",
  MY: "MYR",
  PH: "PHP",
  SG: "SGD",
  TH: "THB",
  TL: "USD", // Timor-Leste is dollarised (rule 2).
  TW: "TWD",
  VN: "VND",

  // ---- Oceania ----
  AS: "USD",
  AU: "AUD",
  CC: "AUD",
  CK: "NZD",
  CX: "AUD",
  FJ: "FJD",
  FM: "USD",
  GU: "USD",
  IO: "USD",
  KI: "AUD",
  MH: "USD",
  MP: "USD",
  NC: "XPF",
  NF: "AUD",
  NR: "AUD",
  NU: "NZD",
  NZ: "NZD",
  PF: "XPF",
  PG: "PGK",
  PN: "NZD",
  PW: "USD",
  SB: "SBD",
  TK: "NZD",
  TO: "TOP",
  TV: "AUD",
  VU: "VUV",
  WF: "XPF",
  WS: "WST",
};

/** True when the code is a syntactically valid ISO 3166-1 alpha-2 code. */
function normaliseCountryCode(countryCode?: string | null): string | null {
  const code = (countryCode ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * Currency for a country code, or `XXX` when unknown/invalid/ambiguous.
 * This is the single source of truth — do not add local `if (country === ...)`.
 */
export function currencyForCountryCode(countryCode?: string | null): CurrencyCode {
  const code = normaliseCountryCode(countryCode);
  if (!code) return NEUTRAL_CURRENCY_CODE;
  if (code in AMBIGUOUS_CURRENCY_COUNTRIES) return NEUTRAL_CURRENCY_CODE;
  return CURRENCY_BY_COUNTRY[code] ?? NEUTRAL_CURRENCY_CODE;
}
