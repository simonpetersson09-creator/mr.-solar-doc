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
  DEFAULT_GRID_FREQUENCY_HZ,
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
 * `capacity`; `phasePrefix` is only a display affordance for markets that
 * write their connection as "3 x 25 A" (FI, NL).
 */
export interface ConnectionOption {
  id: string;
  capacity: ConnectionCapacity;
  /** e.g. "3 x " — prepended to the formatted amount in the UI. */
  phasePrefix?: string;
}

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
  /** False when the profile is a neutral fallback, not verified market data. */
  verified: boolean;
  source: "verified" | "fallback";
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

function kvaOption(
  kva: number,
  profile?: Partial<ConnectionGridProfile>,
  phasePrefix?: string,
): ConnectionOption {
  // The service type is part of the id: a market can offer the same kVA level
  // on both a single-phase and a three-phase connection (FR 9/12 kVA).
  const suffix = profile?.serviceType === "three-phase" ? "-3p" : "";
  return {
    id: `kva${kva}${suffix}`,
    ...(phasePrefix ? { phasePrefix } : {}),
    capacity: { type: "contracted-kva", kva, ...profile },
  };
}

function kwOption(kw: number, profile?: Partial<ConnectionGridProfile>): ConnectionOption {
  const suffix = profile?.serviceType === "three-phase" ? "-3p" : "";
  return { id: `kw${kw}${suffix}`, capacity: { type: "contracted-kw", kw, ...profile } };
}


function config(
  countryCode: string,
  capacityInputType: ConnectionCapacityInputType,
  connectionOptions: ConnectionOption[],
  defaults: ConnectionGridProfile,
  extra: Partial<CountryConnectionConfig> = {},
): CountryConnectionConfig {
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
    verified: true,
    source: "verified",
    ...extra,
  };
}

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
  DK: config(
    "DK",
    "amperage",
    [16, 20, 25, 32, 35, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400)),
    EU_THREE_PHASE_400,
    { localTerm: "Hovedsikring" },
  ),
  /**
   * Germany: the connection capacity is not on the bill; the house connection
   * fuse is what exists. Nothing is preselected — we do not know the user's.
   */
  DE: config(
    "DE",
    "amperage",
    [35, 50, 63].map((a) => ampOption(a, EU_THREE_PHASE_400, "3 × ")),
    EU_THREE_PHASE_400,
    { localTerm: "Hausanschlusssicherung" },
  ),
  /** Great Britain: single-phase 230 V cut-out fuse. */
  GB: config(
    "GB",
    "amperage",
    [60, 80, 100].map((a) => ampOption(a, SINGLE_PHASE_230)),
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
    [100, 200, 400].map((a) => ampOption(a, SPLIT_PHASE_120_240)),
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

  /* --- contracted kVA markets --- */
  /** France: "puissance souscrite" in kVA. */
  FR: config(
    "FR",
    "contracted-kva",
    [
      ...[3, 6, 9, 12].map((kva) => kvaOption(kva, SINGLE_PHASE_230)),
      ...[9, 12, 15, 18, 24, 30, 36].map((kva) => kvaOption(kva, EU_THREE_PHASE_400, "3 × ")),
    ],
    SINGLE_PHASE_230,
    { localTerm: "Puissance souscrite" },
  ),
  /** Portugal: regulated "potência contratada" steps in kVA. */
  PT: config(
    "PT",
    "contracted-kva",
    [1.15, 2.3, 3.45, 4.6, 5.75, 6.9, 10.35].map((kva) => kvaOption(kva, SINGLE_PHASE_230)),
    SINGLE_PHASE_230,
    { localTerm: "Potência contratada" },
  ),

  /* --- contracted kW markets --- */
  /** Spain: "potencia contratada" in kW, free in 0.1 kW steps. */
  ES: config(
    "ES",
    "contracted-kw",
    [3.45, 4.6, 5.75, 6.9].map((kw) => kwOption(kw, SINGLE_PHASE_230)),
    SINGLE_PHASE_230,
    { localTerm: "Potencia contratada" },
  ),
  /** Italy: "potenza impegnata" in kW. */
  IT: config(
    "IT",
    "contracted-kw",
    [3, 4.5, 6, 10, 15].map((kw) => kwOption(kw, SINGLE_PHASE_230)),
    SINGLE_PHASE_230,
    { localTerm: "Potenza impegnata" },
  ),
};

/**
 * Neutral fallback for countries without a verified profile: no country
 * specific options, only manual entry. The grid values below are initial UI
 * values classified as fallback (`verified: false`) — they are never presented
 * as the local standard.
 */
export function fallbackConnectionConfig(countryCode = ""): CountryConnectionConfig {
  return {
    countryCode: countryCode.toUpperCase(),
    capacityInputType: "amperage",
    questionKey: "fuse.genericTitle",
    helpTextKey: "fuse.capacity.amperage.help",
    connectionOptions: [],
    defaultConnection: null,
    // Unverified countries must NOT inherit the Swedish 3-phase 400 V profile
    // as if it were verified. The most common residential service worldwide
    // (single-phase 230 V) is the neutral starting point, clearly marked
    // unverified, and the user can change every value manually.
    defaultServiceType: "single-phase",
    defaultVoltage: 230,
    defaultLineToNeutralVoltage: null,
    defaultFrequencyHz: DEFAULT_GRID_FREQUENCY_HZ,
    verified: false,
    source: "fallback",
  };
}

/** Country (never the app language) decides the connection input. */
export function getConnectionConfig(countryCode?: string | null): CountryConnectionConfig {
  const code = (countryCode ?? "").toUpperCase();
  return COUNTRY_CONNECTION_CONFIGS[code] ?? fallbackConnectionConfig(code);
}

export function hasVerifiedConnectionConfig(countryCode?: string | null): boolean {
  return getConnectionConfig(countryCode).verified;
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
