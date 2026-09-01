/**
 * Grid profile: the electrical connection the AC power limit is derived from.
 * Scalable by design — adding a voltage or frequency level is a list change,
 * and adding a new service type is a one-row lookup-table change.
 */

/**
 * Phase count of a service. 2 represents a two-phase (phase-to-phase) service,
 * e.g. a 220 V phase-to-phase connection in 127/220 V markets such as Brazil.
 */
export type PhaseCount = 1 | 2 | 3;

/**
 * Electrical service type. The AC-power factor is derived from a lookup
 * table keyed by service type — never a hardcoded phase-count check — so
 * future service types (e.g. "split-phase" for US/CA) can be added by
 * extending the tables below without redoing the calculation formula.
 */
export type ServiceType = "single-phase" | "two-phase" | "three-phase" | "split-phase";

/** Maps the UI's phase count to its electrical service type. */
export const SERVICE_TYPE_FOR_PHASE_COUNT: Record<PhaseCount, ServiceType> = {
  1: "single-phase",
  2: "two-phase",
  3: "three-phase",
};

/**
 * Nominal phase count stored alongside a service type. Split-phase (US/CA
 * 120/240 V) is a single-phase transformer secondary with a centre tap — it is
 * NOT modelled as ordinary single- or three-phase in the power formula.
 */
export const PHASE_COUNT_FOR_SERVICE_TYPE: Record<ServiceType, PhaseCount> = {
  "single-phase": 1,
  "two-phase": 2,
  "three-phase": 3,
  "split-phase": 1,
};

/** Selectable service types, in display order. */
export const SERVICE_TYPE_OPTIONS: readonly ServiceType[] = [
  "single-phase",
  "two-phase",
  "three-phase",
  "split-phase",
];

/**
 * AC power factor per service type:
 *  - three-phase: sqrt(3)  ->  P(kW) = sqrt(3) x U_LL x I / 1000
 *  - single-phase: 1       ->  P(kW) = U_LN x I / 1000
 *  - split-phase: 1        ->  P(kW) = U_LL x I / 1000 (240 V, not 120 V)
 *  - two-phase: 1          ->  P(kW) = U_LL x I / 1000 (phase-to-phase, no sqrt(3))
 */
export const SERVICE_TYPE_AC_FACTOR: Record<ServiceType, number> = {
  "single-phase": 1,
  "two-phase": 1,
  "three-phase": Math.sqrt(3),
  "split-phase": 1,
};

/**
 * Which voltage the stored `voltageV` represents for each service type. The
 * calculation always uses this reference voltage — for split-phase that is the
 * line-to-line voltage (240 V of a 120/240 V service), never the 120 V leg.
 */
export const SERVICE_TYPE_VOLTAGE_REFERENCE: Record<
  ServiceType,
  "line-to-line" | "line-to-neutral"
> = {
  "single-phase": "line-to-neutral",
  "two-phase": "line-to-line",
  "three-phase": "line-to-line",
  "split-phase": "line-to-line",
};

/** Split-phase (US/CA residential) nominal values. */
export const SPLIT_PHASE_LINE_TO_LINE_V = 240;
export const SPLIT_PHASE_LINE_TO_NEUTRAL_V = 120;
/** 240/208 V North America, 200 V Japanese single-phase three-wire. */
export const SPLIT_PHASE_VOLTAGE_OPTIONS: readonly number[] = [240, 208, 200];
export const SPLIT_PHASE_FREQUENCY_HZ = 60;

/** Line-to-neutral voltage of a split-phase service (centre-tapped). */
export function splitPhaseLineToNeutral(lineToLineV: number): number {
  return lineToLineV / 2;
}

/**
 * Two-phase (phase-to-phase) presets are LINE-TO-LINE voltages: two phases of a
 * three-phase system without the neutral, e.g. 220 V of a Brazilian 127/220 V
 * grid. Power is U_LL x I — sqrt(3) is NEVER applied.
 */
export const TWO_PHASE_LINE_TO_LINE_V = 220;
export const TWO_PHASE_VOLTAGE_OPTIONS: readonly number[] = [208, 220, 230, 240, 380, 400];

/** Selectable phase counts, in display order. */
export const GRID_PHASE_OPTIONS: readonly PhaseCount[] = [1, 3];

/** Selectable nominal voltages (V), in display order. Extend freely. */
/** 127 V covers Latin-American 127/220 V services (MX, BR). */
export const GRID_VOLTAGE_OPTIONS: readonly number[] = [127, 220, 230, 240, 380, 400, 415];

/**
 * Single-phase presets are LINE-TO-NEUTRAL voltages only. A 400 V line-to-line
 * voltage can never be a single-phase service voltage, so it is not offered.
 */
export const SINGLE_PHASE_VOLTAGE_OPTIONS: readonly number[] = [120, 127, 220, 230, 240];

/** Three-phase presets are LINE-TO-LINE voltages only. */
export const THREE_PHASE_VOLTAGE_OPTIONS: readonly number[] = [208, 220, 230, 380, 400, 415];

/** Voltage presets for a given service type. */
export function voltageOptionsForService(serviceType: ServiceType): readonly number[] {
  if (serviceType === "split-phase") return SPLIT_PHASE_VOLTAGE_OPTIONS;
  if (serviceType === "two-phase") return TWO_PHASE_VOLTAGE_OPTIONS;
  if (serviceType === "single-phase") return SINGLE_PHASE_VOLTAGE_OPTIONS;
  return THREE_PHASE_VOLTAGE_OPTIONS;
}

/** Default voltages per service type, used when a service switch invalidates the current one. */
export const DEFAULT_VOLTAGE_FOR_SERVICE: Record<ServiceType, number> = {
  "single-phase": 230,
  "two-phase": TWO_PHASE_LINE_TO_LINE_V,
  "three-phase": 400,
  "split-phase": SPLIT_PHASE_LINE_TO_LINE_V,
};

/**
 * The voltage to keep when switching service type: the current one when it is a
 * valid preset for the new service, otherwise that service's nominal default.
 * Prevents impossible combinations such as "1-phase 400 V".
 */
export function voltageForServiceSwitch(serviceType: ServiceType, currentVoltageV: number): number {
  return voltageOptionsForService(serviceType).includes(currentVoltageV)
    ? currentVoltageV
    : DEFAULT_VOLTAGE_FOR_SERVICE[serviceType];
}

/**
 * The voltage an EXPLICIT phase choice sets. Unlike `voltageForServiceSwitch`
 * (advanced editing, which keeps a still-valid voltage), picking "1-phase" or
 * "3-phase" always snaps to that service's nominal voltage: 230 V line-to-
 * neutral or 400 V line-to-line. Otherwise a 230 V line-to-neutral value would
 * silently survive a switch to three-phase and be reused as 230 V line-to-line.
 * The user may still set another physically valid voltage afterwards.
 */
export function voltageForPhaseChoice(serviceType: ServiceType): number {
  return DEFAULT_VOLTAGE_FOR_SERVICE[serviceType];
}



/** Bounds for a user-entered custom voltage (V). */
export const MIN_CUSTOM_VOLTAGE_V = 50;
export const MAX_CUSTOM_VOLTAGE_V = 1000;

/** True when the voltage is one of the predefined options for the service. */
export function isPresetVoltage(voltageV: number, serviceType?: ServiceType): boolean {
  return voltageOptionsForService(serviceType ?? "three-phase").includes(voltageV);
}

/**
 * A custom voltage must be a positive number inside plausible LV bounds.
 * Custom voltages feed the exact same `kwPerAmpFor` calculation as presets.
 */
export function isValidCustomVoltage(voltageV: number | null): boolean {
  return (
    voltageV !== null &&
    Number.isFinite(voltageV) &&
    voltageV >= MIN_CUSTOM_VOLTAGE_V &&
    voltageV <= MAX_CUSTOM_VOLTAGE_V
  );
}

/** Selectable grid frequencies (Hz). */
export const GRID_FREQUENCY_OPTIONS: readonly number[] = [50, 60];

export const DEFAULT_GRID_PHASE_COUNT: PhaseCount = 3;
export const DEFAULT_GRID_VOLTAGE_V = 400;
export const DEFAULT_GRID_FREQUENCY_HZ = 50;

export interface GridProfile {
  phaseCount: PhaseCount;
  voltageV: number;
  /** Stored as part of the profile; does not affect the power calculation. */
  frequencyHz: number;
  mainFuseAmps: number | null;
}

export const DEFAULT_GRID_PROFILE: Omit<GridProfile, "mainFuseAmps"> = {
  phaseCount: DEFAULT_GRID_PHASE_COUNT,
  voltageV: DEFAULT_GRID_VOLTAGE_V,
  frequencyHz: DEFAULT_GRID_FREQUENCY_HZ,
};

/**
 * kW allowed per ampere of main fuse for a given connection.
 * Derived from the service type's AC factor: factor x U / 1000.
 *  - three-phase, 400 V: sqrt(3) x 400 / 1000 ≈ 0.693 kW/A
 *  - single-phase, 230 V: 230 / 1000 = 0.23 kW/A
 * The frequency is stored on the profile but never affects this result.
 */
export function kwPerAmpFor(phaseCount: PhaseCount, voltageV: number): number {
  const serviceType = SERVICE_TYPE_FOR_PHASE_COUNT[phaseCount];
  const factor = SERVICE_TYPE_AC_FACTOR[serviceType];
  return (factor * voltageV) / 1000;
}
/**
 * Voltage semantics — one meaning per service type, never mixed:
 *  - three-phase: U is the LINE-TO-LINE voltage (e.g. 400 V in Europe, 415 V in
 *    UK-style systems), used as P(kW) = sqrt(3) x U_LL x I / 1000
 *  - single-phase: U is the LINE-TO-NEUTRAL voltage (e.g. 230 V),
 *    used as P(kW) = U_LN x I / 1000
 *  - split-phase: U is the LINE-TO-LINE voltage of the service (240 V of a
 *    120/240 V US/CA service), used as P(kW) = U_LL x I / 1000.
 *    The 120 V leg is NEVER the service voltage, and sqrt(3) is never applied.
 * Never pass a phase-neutral voltage for a three-phase or split-phase service.
 */
export interface GridPowerInput {
  /** Main fuse / service rating in amperes. */
  mainFuseAmp: number;
  /** Reference voltage: line-to-line except for single-phase (line-to-neutral). */
  voltageV: number;
  /** Service type; derived from `phaseCount` when omitted. */
  serviceType?: ServiceType;
  phaseCount?: PhaseCount;
  /**
   * Optional explicit line-to-line voltage. When given for a split-phase or
   * three-phase service it takes precedence over `voltageV`.
   */
  lineToLineVoltageV?: number | null;
  /** Optional explicit line-to-neutral voltage (e.g. 120 V of 120/240 V). */
  lineToNeutralVoltageV?: number | null;
}

/** kW per ampere for a service type. Single source of the power rule. */
export function kwPerAmpForService(serviceType: ServiceType, voltageV: number): number {
  return (SERVICE_TYPE_AC_FACTOR[serviceType] * voltageV) / 1000;
}

/** The voltage a given service type's power calculation must use. */
export function referenceVoltageFor(input: GridPowerInput, serviceType: ServiceType): number {
  const reference = SERVICE_TYPE_VOLTAGE_REFERENCE[serviceType];
  if (reference === "line-to-line" && input.lineToLineVoltageV != null) {
    return input.lineToLineVoltageV;
  }
  if (reference === "line-to-neutral" && input.lineToNeutralVoltageV != null) {
    return input.lineToNeutralVoltageV;
  }
  return input.voltageV;
}

/**
 * The ONE place the maximum AC power of a grid connection is computed.
 * Full precision — round only when presenting. Frequency never affects it.
 */
export function maxAcPowerKwFor(input: GridPowerInput): number {
  const serviceType =
    input.serviceType ??
    SERVICE_TYPE_FOR_PHASE_COUNT[input.phaseCount ?? DEFAULT_GRID_PHASE_COUNT];
  const voltageV = referenceVoltageFor(input, serviceType);
  return input.mainFuseAmp * kwPerAmpForService(serviceType, voltageV);
}

