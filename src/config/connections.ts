/**
 * Country-specific electrical connection input for step 4.
 *
 * The country (from the address) decides WHICH question is asked, in which
 * unit, and which options are offered. It never decides how power is computed:
 * every option is a `ConnectionCapacity` that is normalised by
 * `connectionCapacityToMaxAcPowerKw` in `@/config/connection-capacity`.
 *
 * Flow: address -> countryCode -> connection config -> user choice ->
 *       ConnectionCapacity -> maxAcPowerKw -> sizing.
 *
 * Only countries whose data the connection audit rated as high confidence are
 * listed here. Everything else uses the generic fallback — a fallback is never
 * presented as a verified local profile.
 */

import {
  SPLIT_PHASE_FREQUENCY_HZ,
  SPLIT_PHASE_LINE_TO_LINE_V,
  SPLIT_PHASE_LINE_TO_NEUTRAL_V,
  type ServiceType,
} from "./grid";
import type {
  ConnectionCapacity,
  ConnectionCapacityInputType,
  ConnectionGridProfile,
} from "./connection-capacity";

/**
 * One selectable connection. The technical content lives entirely in
 * `capacity`; `phasePrefix` is only a display affordance for AMPERE markets
 * that write their connection per phase, e.g. "3 x 25 A" (FI, NL).
 *
 * It must never be used for contracted kVA/kW options: those values are always
 * totals, and a "3 x 9 kVA" label would imply 27 kVA while the engine uses 9.
 * `connections.test.ts` asserts this.
 */
export interface ConnectionOption {
  id: string;
  capacity: ConnectionCapacity;
  /** e.g. "3 x " — amperage options only; prepended to the formatted amount. */
  phasePrefix?: string;
}


/**
 * How much we actually know about a country's residential connection.
 *  - "verified":  confirmed national data. May be presented as the local standard.
 *  - "generic":   a plausible regional profile that is NOT confirmed for this
 *                 country. Must be presented as unverified and the user has to
 *                 confirm the grid data before the result may be trusted.
 *  - "unsupported": nothing is known. Manual entry only, always unverified.
 */
export type ConnectionProfileStatus = "verified" | "generic" | "unsupported";

export interface CountryConnectionConfig {
  countryCode: string;
  /** Which unit the consumer states their connection in. */
  capacityInputType: ConnectionCapacityInputType;
  /** i18n key for the step question. */
  questionKey: string;
  /** i18n key for the help text under the question. */
  helpTextKey: string;
  /**
   * The verbatim local billing/technical term ("Puissance souscrite"). This is
   * market data, not UI copy: it reads the same in every app language, so it
   * is intentionally not routed through i18n.
   */
  localTerm?: string;
  connectionOptions: ConnectionOption[];
  /** Id of the pre-selected option, or null when none should be pre-selected. */
  defaultConnection: string | null;
  defaultServiceType: ServiceType;
  defaultVoltage: number;
  /** Line-to-neutral default (split-phase). Null when not applicable. */
  defaultLineToNeutralVoltage?: number | null;
  defaultFrequencyHz: number;
  /** Override of the documented kVA -> kW assumption, when verified locally. */
  contractedKvaPowerFactor?: number;
  /** Explicit knowledge level. Drives the UI, never the maths. */
  status: ConnectionProfileStatus;
  /** Convenience mirror of `status === "verified"`. Never set by hand. */
  verified: boolean;
  source: "verified" | "generic" | "fallback";
}


/* ---------------------------------------------------------------- profiles */

const EU_THREE_PHASE_400: ConnectionGridProfile = {
  serviceType: "three-phase",
  voltageV: 400,
  frequencyHz: 50,
};

/** Three-phase without neutral (NO 230 V IT, BE 3x230 V). NOT a 400 V grid. */
const THREE_PHASE_230: ConnectionGridProfile = {
  serviceType: "three-phase",
  voltageV: 230,
  frequencyHz: 50,
};

const SINGLE_PHASE_230: ConnectionGridProfile = {
  serviceType: "single-phase",
  voltageV: 230,
  frequencyHz: 50,
};

const SPLIT_PHASE_120_240: ConnectionGridProfile = {
  serviceType: "split-phase",
  voltageV: SPLIT_PHASE_LINE_TO_LINE_V,
  lineToNeutralVoltageV: SPLIT_PHASE_LINE_TO_NEUTRAL_V,
  frequencyHz: SPLIT_PHASE_FREQUENCY_HZ,
};

/**
 * Japan: single-phase three-wire 100/200 V. The contract amperage refers to
 * the 200 V level. Mains frequency is regional (50 Hz east / 60 Hz west) —
 * 50 Hz is the stored initial value and the user can change it; it never
 * affects the power calculation.
 */
const JP_SINGLE_PHASE_200: ConnectionGridProfile = {
  // Single-phase three-wire is electrically a centre-tapped (split-phase)
  // service: the contract amperage applies to the 200 V line-to-line level,
  // factor 1.0 and never the 100 V leg.
  serviceType: "split-phase",
  voltageV: 200,
  lineToNeutralVoltageV: 100,
  frequencyHz: 50,
};

/* ------------------------------------------------------------ option specs */

function ampOption(
  amperageA: number,
  profile: ConnectionGridProfile,
  phasePrefix?: string,
): ConnectionOption {
  const phases = profile.serviceType === "three-phase" ? 3 : 1;
  return {
    id: `a${phases}x${amperageA}@${profile.voltageV}`,
    ...(phasePrefix ? { phasePrefix } : {}),
    capacity: { type: "amperage", amperageA, ...profile },
  };
}

/**
 * A contracted apparent power (kVA) is ALWAYS the total for the connection,
 * never a per-phase figure. Therefore a kVA option carries no phase prefix and
 * no pinned grid profile: the number is the same on 1-phase 230 V and on
 * 3-phase 400 V. Phases/voltage live in the grid settings.
 */
function kvaOption(kva: number): ConnectionOption {
  return { id: `kva${kva}`, capacity: { type: "contracted-kva", kva } };
}


/** Contracted active power (kW) is likewise a total, never per phase. */
function kwOption(kw: number): ConnectionOption {
  return { id: `kw${kw}`, capacity: { type: "contracted-kw", kw } };
}



function config(
  countryCode: string,
  capacityInputType: ConnectionCapacityInputType,
  connectionOptions: ConnectionOption[],
  defaults: ConnectionGridProfile,
  extra: Partial<CountryConnectionConfig> = {},
): CountryConnectionConfig {
  const status: ConnectionProfileStatus = extra.status ?? "verified";
  return {
    countryCode,
    capacityInputType,
    questionKey: `fuse.capacity.${capacityInputType}.title`,
    helpTextKey: `fuse.capacity.${capacityInputType}.help`,
    connectionOptions,
    defaultConnection: null,
    defaultServiceType: defaults.serviceType,
    defaultVoltage: defaults.voltageV,
    defaultLineToNeutralVoltage: defaults.lineToNeutralVoltageV ?? null,
    defaultFrequencyHz: defaults.frequencyHz,
    ...extra,
    status,
    // Derived, never hand-set: only "verified" may claim national data.
    verified: status === "verified",
    source: status === "verified" ? "verified" : status === "generic" ? "generic" : "fallback",
  };
}

/**
 * North American service sizes. 100/125/150/200/400 A are the standard
 * residential steps; 60 A only exists on legacy services and is kept so those
 * homes can answer. Sizes above 400 A are not residential.
 */
const NORTH_AMERICAN_RATINGS = [60, 100, 125, 150, 200, 400];



/** Verified country profiles. Add a country only when its data is confirmed. */
export const COUNTRY_CONNECTION_CONFIGS: Record<string, CountryConnectionConfig> = {
  /* --- ampere markets --- */
  SE: config(
    "SE",
    "amperage",
    [16, 20, 25, 35, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400)),
    EU_THREE_PHASE_400,
    { localTerm: "Huvudsäkring" },
  ),
  /** Finland writes the main fuse as "3 x 25 A". */
  FI: config(
    "FI",
    "amperage",
    [
      ...[25, 35, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
      ...[25, 35].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
    ],
    EU_THREE_PHASE_400,
    { localTerm: "Pääsulake" },
  ),
  /** Netherlands: "aansluitwaarde", stated as 1x/3x amperes. */
  NL: config(
    "NL",
    "amperage",
    [
      ...[25, 35].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
      ...[25, 35, 50, 63, 80].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
    ],
    SINGLE_PHASE_230,
    { localTerm: "Aansluitwaarde" },
  ),
  /** Denmark: 40 A is a standard step in the Danish fuse series. */
  DK: config(
    "DK",
    "amperage",
    [16, 20, 25, 32, 35, 40, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400)),
    EU_THREE_PHASE_400,
    { localTerm: "Hovedsikring" },
  ),
  /**
   * Germany: the connection capacity is not on the bill; the house connection
   * fuse is what exists. 3 x 25 A is the common small connection
   * ("Kleinstanschluss"). Nothing is preselected — we do not know the user's.
   */
  DE: config(
    "DE",
    "amperage",
    [25, 35, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
    EU_THREE_PHASE_400,
    { localTerm: "Hausanschlusssicherung" },
  ),

  /**
   * Great Britain: the cut-out fuse on a single-phase 230 V supply. 60/80 A are
   * common on older services, 100 A is the modern standard. Three-phase
   * 400 V services exist on larger homes and are offered explicitly.
   */
  GB: config(
    "GB",
    "amperage",
    [
      ...[60, 80, 100].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
      ...[60, 80, 100].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × 400 V · ")),
    ],
    SINGLE_PHASE_230,
    { localTerm: "Main fuse (cut-out)" },
  ),

  /**
   * Belgium: the network type must be part of the choice — 3x230 V without
   * neutral is a fundamentally different capacity than 3N400 V.
   */
  BE: config(
    "BE",
    "amperage",
    [
      ...[25, 32, 40, 63].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
      ...[25, 32, 40, 63].map((a) => ampOption(a, THREE_PHASE_230, "3 × 230 V · ")),
      ...[25, 32, 40, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3N × 400 V · ")),
    ],
    SINGLE_PHASE_230,
    { localTerm: "Aansluitvermogen / Puissance de raccordement" },
  ),
  US: config(
    "US",
    "amperage",
    NORTH_AMERICAN_RATINGS.map((a) => ampOption(a, SPLIT_PHASE_120_240)),
    SPLIT_PHASE_120_240,
    { localTerm: "Electrical service size" },
  ),
  CA: config(
    "CA",
    "amperage",
    NORTH_AMERICAN_RATINGS.map((a) => ampOption(a, SPLIT_PHASE_120_240)),
    SPLIT_PHASE_120_240,
    { localTerm: "Electrical service size" },
  ),

  /** Japan: contract amperage on a 100/200 V single-phase three-wire supply. */
  JP: config(
    "JP",
    "amperage",
    [10, 15, 20, 30, 40, 50, 60].map((a) => ampOption(a, JP_SINGLE_PHASE_200)),
    JP_SINGLE_PHASE_200,
    { localTerm: "契約アンペア" },
  ),
  /**
   * Norway: "hovedsikring" in amperes. Large parts of the country run a
   * 230 V IT/delta network without neutral, so three-phase 230 V must be
   * offered next to the newer 400 V TN service.
   */
  NO: config(
    "NO",
    "amperage",
    [
      ...[25, 32, 40, 63].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
      ...[25, 32, 40, 63].map((a) => ampOption(a, THREE_PHASE_230, "3 × 230 V · ")),
      ...[25, 32, 40, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3N × 400 V · ")),
    ],
    THREE_PHASE_230,
    { localTerm: "Hovedsikring" },
  ),
  /** Austria: "Anschlussleistung" is set by the house connection fuse. */
  AT: config(
    "AT",
    "amperage",
    [
      ...[20, 25, 32, 35, 40, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
      ...[16, 20, 25, 32].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
    ],
    EU_THREE_PHASE_400,
    { localTerm: "Hausanschlusssicherung" },
  ),
  /** Czechia: "hlavní jistič" in amperes — the billed quantity. */
  CZ: config(
    "CZ",
    "amperage",
    [
      ...[16, 20, 25, 32, 40, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
      ...[25, 32, 40].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
    ],
    EU_THREE_PHASE_400,
    { localTerm: "Hlavní jistič" },
  ),
  /** Slovakia: "hlavný istič" in amperes, with an official A -> kW table. */
  SK: config(
    "SK",
    "amperage",
    [
      ...[16, 20, 25, 32, 40, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
      ...[25, 32, 40].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
    ],
    EU_THREE_PHASE_400,
    { localTerm: "Hlavný istič" },
  ),
  /** Estonia: "peakaitse" in amperes, per the network operator's price list. */
  EE: config(
    "EE",
    "amperage",
    [
      ...[16, 20, 25, 32, 35, 40, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
      ...[16, 20, 25, 32, 35, 40].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
    ],
    EU_THREE_PHASE_400,
    { localTerm: "Peakaitse" },
  ),



  /* --- contracted kVA markets --- */
  /**
   * France: "puissance souscrite" in kVA — always the TOTAL subscribed
   * apparent power. 9 kVA is 9 kVA whether the supply is monophasé 230 V or
   * triphasé 400 V; it is never 3 x 9 kVA.
   */
  FR: config(
    "FR",
    "contracted-kva",
    [3, 6, 9, 12, 15, 18, 24, 30, 36].map((kva) => kvaOption(kva)),
    SINGLE_PHASE_230,
    { localTerm: "Puissance souscrite" },
  ),
  /**
   * Portugal: regulated "potência contratada" steps in kVA (total). The BTN
   * ladder continues above 10.35 kVA (13.8 / 17.25 / 20.7 kVA), which is where
   * households with a heat pump or an EV charger sit.
   */
  PT: config(
    "PT",
    "contracted-kva",
    [1.15, 2.3, 3.45, 4.6, 5.75, 6.9, 10.35, 13.8, 17.25, 20.7].map((kva) => kvaOption(kva)),
    SINGLE_PHASE_230,
    { localTerm: "Potência contratada" },
  ),

  /* --- contracted kW markets --- */
  /**
   * Spain: "potencia contratada" in kW. The regulated BOE ladder — 9.2 and
   * 11.5 kW are the common levels for homes with an EV or a heat pump.
   */
  ES: config(
    "ES",
    "contracted-kw",
    [1.15, 2.3, 3.45, 4.6, 5.75, 6.9, 8.05, 9.2, 10.35, 11.5, 14.49].map((kw) => kwOption(kw)),
    SINGLE_PHASE_230,
    { localTerm: "Potencia contratada" },
  ),
  /** Italy: "potenza impegnata" in kW. 1.5 kW covers holiday homes. */
  IT: config(
    "IT",
    "contracted-kw",
    [1.5, 3, 4.5, 6, 10, 15].map((kw) => kwOption(kw)),
    SINGLE_PHASE_230,
    { localTerm: "Potenza impegnata" },
  ),
  /**
   * Poland: the connection is contracted as "moc umowna" in kW — the figure
   * printed on the bill. Asking for amperes would force the consumer to
   * convert from something they never see.
   */
  PL: config(
    "PL",
    "contracted-kw",
    [3, 4, 5, 6, 8, 10, 12, 14, 17, 20, 25, 30].map((kw) => kwOption(kw)),
    SINGLE_PHASE_230,
    { localTerm: "Moc umowna" },
  ),
  /**
   * Slovenia: "priključna moč" is officially stated in kW, with a fixed
   * kW <-> fuse table held by the operator. Single-phase homes sit at 4-8 kW,
   * three-phase homes from 11 kW upwards.
   */
  SI: config(
    "SI",
    "contracted-kw",
    [4, 5, 6, 7, 8, 11, 14, 17, 22, 24, 35, 43].map((kw) => kwOption(kw)),
    EU_THREE_PHASE_400,
    { localTerm: "Priključna moč" },
  ),

  /**
   * Latvia: the connection is stated as connection current per phase
   * ("pieslēguma strāva"), 1 x 16-32 A for single-phase homes and
   * 3 x 16-63 A for three-phase. Source: Sadales tīkls tariff table.
   */
  LV: config(
    "LV",
    "amperage",
    [
      ...[16, 20, 25, 32].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
      ...[16, 20, 25, 32, 40, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
    ],
    EU_THREE_PHASE_400,
    { localTerm: "Pieslēguma strāva" },
  ),

  /* --- contracted kVA markets (continued) --- */
  /**
   * Ireland: the connection is the Maximum Import Capacity (MIC) in kVA — a
   * TOTAL for the connection, identical on 230 V single-phase and 400 V
   * three-phase. ESB Networks lists 12 kVA (standard) and 16 kVA (enhanced)
   * for domestic connections. MIC is import capacity and says nothing about
   * permitted PV export — micro-generation has its own rules.
   */
  IE: config(
    "IE",
    "contracted-kva",
    [12, 16].map((kva) => kvaOption(kva)),
    SINGLE_PHASE_230,
    { localTerm: "Maximum Import Capacity (MIC)" },
  ),

  /* --- contracted kW markets (continued) --- */
  /**
   * Croatia: "priključna snaga" in kW (total). HEP ODS publishes the standard
   * ladder: single-phase 4.60 / 5.75 / 7.36 / 9.20 / 11.50 kW and symmetrical
   * three-phase 11.04 / 13.80 / 17.25 / 22.00 kW.
   */
  HR: config(
    "HR",
    "contracted-kw",
    [4.6, 5.75, 7.36, 9.2, 11.5, 11.04, 13.8, 17.25, 22].map((kw) => kwOption(kw)),
    EU_THREE_PHASE_400,
    { localTerm: "Priključna snaga" },
  ),
  /**
   * Lithuania: "leistinoji naudoti galia" in kW (total permitted power).
   * ESO lists 3-5 kW single-phase and 7-60 kW three-phase, and recommends a
   * three-phase connection above 6 kW.
   */
  LT: config(
    "LT",
    "contracted-kw",
    [3, 4, 5, 7, 9, 11, 14, 18, 22, 28, 35, 45, 60].map((kw) => kwOption(kw)),
    EU_THREE_PHASE_400,
    { localTerm: "Leistinoji naudoti galia" },
  ),

};


/**
 * GENERIC (unverified) continental-European profile.
 *
 * These markets are in the launch list, but their national connection data is
 * not confirmed at the same level as the verified profiles above. They are
 * NOT given the Swedish profile as if it were their own, and they are NOT left
 * on a single-phase 230 V fallback either — that would be an equally
 * unverified claim, only a worse one for a region where 3N~400 V is the
 * dominant residential service.
 *
 * The profile is explicitly flagged `status: "generic"`, so the UI must
 * present it as unverified and require the user to confirm the grid data
 * before the recommendation is shown as reliable. Upgrading a country later
 * means moving its code from this list into a verified `config(...)` entry —
 * no other code changes.
 */
const GENERIC_EU_AMPERE_LEVELS = [16, 20, 25, 32, 35, 40, 50, 63];

const GENERIC_EU_MARKET_CODES = ["CH"] as const;

function genericEuConfig(countryCode: string): CountryConnectionConfig {
  return config(
    countryCode,
    "amperage",
    [
      ...GENERIC_EU_AMPERE_LEVELS.map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
      ...[16, 20, 25, 32, 35, 40].map((a) => ampOption(a, SINGLE_PHASE_230, "1 × ")),
    ],
    EU_THREE_PHASE_400,
    { status: "generic", questionKey: "fuse.genericTitle" },
  );
}

export const GENERIC_CONNECTION_CONFIGS: Record<string, CountryConnectionConfig> =
  Object.fromEntries(GENERIC_EU_MARKET_CODES.map((code) => [code, genericEuConfig(code)]));

/**
 * Mains frequency is a well documented physical fact even for countries whose
 * connection ladder we have not verified, so an unknown country still gets the
 * right frequency instead of a blanket 50 Hz. Nothing else is claimed.
 */
const SIXTY_HZ_COUNTRIES = new Set([
  "US", "CA", "MX", "BR", "CO", "VE", "PE", "EC", "GT", "CR", "PA", "DO", "CU", "HN",
  "NI", "SV", "PR", "KR", "TW", "PH", "SA", "AE", "KW", "LR", "GU",
]);

/** 50 Hz unless the country is a documented 60 Hz market. */
export function defaultFrequencyForCountry(countryCode?: string | null): number {
  return SIXTY_HZ_COUNTRIES.has((countryCode ?? "").toUpperCase()) ? 60 : 50;
}

/**
 * Last-resort profile for countries we know nothing about: no options, manual
 * entry only, `status: "unsupported"`. Never presented as a local standard.
 */
export function fallbackConnectionConfig(countryCode = ""): CountryConnectionConfig {
  return {
    countryCode: countryCode.toUpperCase(),
    capacityInputType: "amperage",
    questionKey: "fuse.genericTitle",
    helpTextKey: "fuse.capacity.amperage.help",
    connectionOptions: [],
    defaultConnection: null,
    // Nothing is claimed here. Single-phase 230 V is only the starting value
    // in the input fields; the user must confirm or change every value.
    defaultServiceType: "single-phase",
    defaultVoltage: 230,
    defaultLineToNeutralVoltage: null,
    defaultFrequencyHz: defaultFrequencyForCountry(countryCode),
    status: "unsupported",
    verified: false,
    source: "fallback",
  };
}

/** Country (never the app language) decides the connection input. */
export function getConnectionConfig(countryCode?: string | null): CountryConnectionConfig {
  const code = (countryCode ?? "").toUpperCase();
  return (
    COUNTRY_CONNECTION_CONFIGS[code] ??
    GENERIC_CONNECTION_CONFIGS[code] ??
    fallbackConnectionConfig(code)
  );
}

export function hasVerifiedConnectionConfig(countryCode?: string | null): boolean {
  return getConnectionConfig(countryCode).status === "verified";
}

/** True when the user must actively confirm the grid data before trusting it. */
export function requiresGridConfirmation(config: CountryConnectionConfig): boolean {
  return config.status !== "verified";
}


export function findConnectionOption(
  config: CountryConnectionConfig,
  optionId: string | null,
): ConnectionOption | null {
  if (!optionId) return null;
  return config.connectionOptions.find((option) => option.id === optionId) ?? null;
}

/** The grid profile a country config starts from. */
export function defaultGridProfileFor(
  config: CountryConnectionConfig,
): ConnectionGridProfile {
  return {
    serviceType: config.defaultServiceType,
    voltageV: config.defaultVoltage,
    lineToNeutralVoltageV: config.defaultLineToNeutralVoltage ?? null,
    frequencyHz: config.defaultFrequencyHz,
  };
}
