/**
 * Grid profile: the electrical connection the AC power limit is derived from.
 * Scalable by design — adding a voltage or frequency level is a list change,
 * and adding a new service type is a one-row lookup-table change.
 */

/** Phase count as shown in the UI today. */
export type PhaseCount = 1 | 3;

/**
 * Electrical service type. The AC-power factor is derived from a lookup
 * table keyed by service type — never a hardcoded phase-count check — so
 * future service types (e.g. "split-phase" for US/CA) can be added by
 * extending the tables below without redoing the calculation formula.
 */
export type ServiceType = "single-phase" | "three-phase";

/** Maps the UI's phase count to its electrical service type. */
export const SERVICE_TYPE_FOR_PHASE_COUNT: Record<PhaseCount, ServiceType> = {
  1: "single-phase",
  3: "three-phase",
};

/**
 * AC power factor per service type:
 *  - three-phase: sqrt(3)  ->  P(kW) = sqrt(3) x U x I / 1000
 *  - single-phase: 1       ->  P(kW) = U x I / 1000
 */
export const SERVICE_TYPE_AC_FACTOR: Record<ServiceType, number> = {
  "single-phase": 1,
  "three-phase": Math.sqrt(3),
};

/** Selectable phase counts, in display order. */
export const GRID_PHASE_OPTIONS: readonly PhaseCount[] = [1, 3];

/** Selectable nominal voltages (V), in display order. Extend freely. */
export const GRID_VOLTAGE_OPTIONS: readonly number[] = [220, 230, 240, 380, 400, 415];

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