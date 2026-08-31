/**
 * Country-specific electrical connection options for step 4.
 *
 * The country (from the address) decides WHICH options are offered and what
 * they are called. It never decides how power is calculated — the AC power
 * limit still comes exclusively from the dynamic grid profile
 * (`kwPerAmpFor` in `@/config/grid`).
 *
 * Flow: address -> countryCode -> connection config -> user choice ->
 *       grid profile -> calculation.
 */

import {
  PHASE_COUNT_FOR_SERVICE_TYPE,
  SPLIT_PHASE_FREQUENCY_HZ,
  SPLIT_PHASE_LINE_TO_LINE_V,
  SPLIT_PHASE_LINE_TO_NEUTRAL_V,
  DEFAULT_GRID_FREQUENCY_HZ,
  DEFAULT_GRID_PHASE_COUNT,
  DEFAULT_GRID_VOLTAGE_V,
  SERVICE_TYPE_FOR_PHASE_COUNT,
  type PhaseCount,
  type ServiceType,
} from "./grid";

/**
 * One selectable connection. `label` is free-form on purpose so a market can
 * express its connection as "3 × 25 A", "60 A" or anything else, while the
 * technical data used by the calculation stays in the separate fields.
 */
export interface ConnectionOption {
  id: string;
  /** Free-form display label, e.g. "20 A" or "3 x 25 A". */
  label: string;
  /** Main fuse rating per phase, in amperes. */
  amperage: number;
  serviceType: ServiceType;
  phaseCount: PhaseCount;
  /** Reference voltage: line-to-line, except single-phase (line-to-neutral). */
  voltage: number;
  /** Line-to-neutral voltage where it differs (split-phase 120 of 120/240 V). */
  lineToNeutralVoltage?: number | null;
  frequencyHz: number;
}

export interface CountryConnectionConfig {
  countryCode: string;
  /** i18n key for the step question, so a market can rename the concept. */
  questionKey: string;
  connectionOptions: ConnectionOption[];
  /** Id of the pre-selected option, or null when none should be pre-selected. */
  defaultConnection: string | null;
  defaultServiceType: ServiceType;
  defaultVoltage: number;
  /** Line-to-neutral default (split-phase). Null when not applicable. */
  defaultLineToNeutralVoltage?: number | null;
  defaultFrequencyHz: number;
  /**
   * False when the option list is a neutral fallback rather than verified
   * data for that country. The UI must not present fallback options as if
   * they were country-specific.
   */
  verified: boolean;
  /** Provenance of the profile. "fallback" must never be shown as local data. */
  source: ConnectionDataSource;
  /**
   * Future: regional profiles inside one country (e.g. different grid
   * operators). Empty today; consumers must tolerate it being undefined.
   */
  regions?: Record<string, Partial<CountryConnectionConfig>>;
}

/** Where a connection profile's data comes from. User input always wins. */
export type ConnectionDataSource = "verified" | "fallback" | "userProvided";

interface OptionSpec {
  amperage: number;
  serviceType?: ServiceType;
  lineToNeutralVoltage?: number | null;
  label?: string;
  phaseCount?: PhaseCount;
  voltage?: number;
  frequencyHz?: number;
  id?: string;
}

function buildOption(spec: OptionSpec, defaults: Omit<OptionSpec, "amperage">): ConnectionOption {
  const serviceType = spec.serviceType ?? defaults.serviceType ?? null;
  const phaseCount =
    spec.phaseCount ??
    defaults.phaseCount ??
    (serviceType ? PHASE_COUNT_FOR_SERVICE_TYPE[serviceType] : DEFAULT_GRID_PHASE_COUNT);
  const voltage = spec.voltage ?? defaults.voltage ?? DEFAULT_GRID_VOLTAGE_V;
  const frequencyHz = spec.frequencyHz ?? defaults.frequencyHz ?? DEFAULT_GRID_FREQUENCY_HZ;
  return {
    id: spec.id ?? `${phaseCount}x${spec.amperage}`,
    label: spec.label ?? `${spec.amperage} A`,
    amperage: spec.amperage,
    serviceType: serviceType ?? SERVICE_TYPE_FOR_PHASE_COUNT[phaseCount],
    phaseCount,
    voltage,
    lineToNeutralVoltage:
      spec.lineToNeutralVoltage ?? defaults.lineToNeutralVoltage ?? null,
    frequencyHz,
  };
}

function connectionConfig(
  countryCode: string,
  specs: OptionSpec[],
  overrides: Partial<CountryConnectionConfig> & {
    optionDefaults?: Omit<OptionSpec, "amperage">;
  } = {},
): CountryConnectionConfig {
  const { optionDefaults = {}, ...rest } = overrides;
  const connectionOptions = specs.map((spec) => buildOption(spec, optionDefaults));
  return {
    countryCode,
    questionKey: "fuse.title",
    connectionOptions,
    defaultConnection: null,
    defaultServiceType:
      optionDefaults.serviceType ??
      SERVICE_TYPE_FOR_PHASE_COUNT[optionDefaults.phaseCount ?? DEFAULT_GRID_PHASE_COUNT],
    defaultVoltage: optionDefaults.voltage ?? DEFAULT_GRID_VOLTAGE_V,
    defaultLineToNeutralVoltage: optionDefaults.lineToNeutralVoltage ?? null,
    defaultFrequencyHz: optionDefaults.frequencyHz ?? DEFAULT_GRID_FREQUENCY_HZ,
    verified: true,
    source: "verified",
    ...rest,
  };
}

const SPLIT_PHASE_OPTION_DEFAULTS: Omit<OptionSpec, "amperage"> = {
  serviceType: "split-phase",
  voltage: SPLIT_PHASE_LINE_TO_LINE_V,
  lineToNeutralVoltage: SPLIT_PHASE_LINE_TO_NEUTRAL_V,
  frequencyHz: SPLIT_PHASE_FREQUENCY_HZ,
};

/** Common North American residential service ratings (A). */
const NORTH_AMERICAN_SERVICE_RATINGS: OptionSpec[] = [60, 100, 125, 150, 200, 400].map(
  (amperage) => ({ amperage }),
);

/** Verified country profiles. Add a country only when its data is confirmed. */
export const COUNTRY_CONNECTION_CONFIGS: Record<string, CountryConnectionConfig> = {
  SE: connectionConfig("SE", [
    { amperage: 16 },
    { amperage: 20 },
    { amperage: 25 },
    { amperage: 35 },
    { amperage: 50 },
    { amperage: 63 },
  ]),
  /**
   * North America: residential services are split-phase 120/240 V, 60 Hz.
   * The service rating list is standard panel sizing; no rating is preselected
   * because we cannot know the user's panel.
   */
  US: connectionConfig("US", NORTH_AMERICAN_SERVICE_RATINGS, {
    optionDefaults: SPLIT_PHASE_OPTION_DEFAULTS,
  }),
  CA: connectionConfig("CA", NORTH_AMERICAN_SERVICE_RATINGS, {
    optionDefaults: SPLIT_PHASE_OPTION_DEFAULTS,
  }),
};

/**
 * Neutral fallback for countries without a verified profile: no country
 * specific fuse options at all, only the manual ampere entry plus the
 * standard grid profile as an initial default.
 */
export function fallbackConnectionConfig(countryCode = ""): CountryConnectionConfig {
  return {
    countryCode: countryCode.toUpperCase(),
    questionKey: "fuse.title",
    connectionOptions: [],
    defaultConnection: null,
    defaultServiceType: SERVICE_TYPE_FOR_PHASE_COUNT[DEFAULT_GRID_PHASE_COUNT],
    defaultVoltage: DEFAULT_GRID_VOLTAGE_V,
    defaultLineToNeutralVoltage: null,
    defaultFrequencyHz: DEFAULT_GRID_FREQUENCY_HZ,
    verified: false,
    source: "fallback",
  };
}

/** Country (never the app language) decides the connection options. */
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
