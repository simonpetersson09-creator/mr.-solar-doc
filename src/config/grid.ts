/**
 * Grid profile: the electrical connection the AC power limit is derived from.
 * Scalable by design — adding a voltage or frequency level is a list change.
 */

export type PhaseCount = 1 | 3;

/** Selectable phase counts, in display order. */
export const GRID_PHASE_OPTIONS: readonly PhaseCount[] = [1, 3];

/** Selectable nominal voltages (V), in display order. Extend freely. */
export const GRID_VOLTAGE_OPTIONS: readonly number[] = [230, 240, 400, 415];

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
 * Three-phase: sqrt(3) x U / 1000. Single-phase: U / 1000.
 */
export function kwPerAmpFor(phaseCount: PhaseCount, voltageV: number): number {
  const factor = phaseCount === 3 ? Math.sqrt(3) : 1;
  return (factor * voltageV) / 1000;
}
