import { ABSOLUTE_MAX_DC_AC_RATIO } from "@/config/constants";

/**
 * DC/AC helpers.
 *
 * The single source of truth for the desired DC/AC window is the profile-based
 * `DC_AC_TARGET_RANGES`, bounded by `ABSOLUTE_MAX_DC_AC_RATIO`. The previous
 * fixed-window inverter picker (`recommendInverter`, `targetKwpForInverter`,
 * `TARGET_MIN/MAX_DC_AC_RATIO`) has been removed so the project cannot hold two
 * competing DC/AC models; selection lives in `candidate-selection.ts`.
 */

/** Maximum AC power the grid connection allows, derived from the main fuse. */
export function maxAcPowerFromFuse(mainFuseAmp: number, kwPerAmp: number): number {
  return mainFuseAmp * kwPerAmp;
}

export function dcAcRatio(installedKwp: number, inverterKw: number): number {
  if (inverterKw <= 0) return 0;
  return installedKwp / inverterKw;
}

export function oversizingPercent(installedKwp: number, inverterKw: number): number {
  return (dcAcRatio(installedKwp, inverterKw) - 1) * 100;
}

/** Largest array (kWp) the chosen inverter may carry under the ceiling. */
export function maxArrayForInverter(inverterKw: number): number {
  return inverterKw * ABSOLUTE_MAX_DC_AC_RATIO;
}

/** Largest whole number of modules the inverter may carry under the ceiling. */
export function maxPanelCountForInverter(inverterKw: number, panelPowerKwp: number): number {
  if (panelPowerKwp <= 0) return 0;
  return Math.floor((inverterKw * ABSOLUTE_MAX_DC_AC_RATIO + 1e-9) / panelPowerKwp);
}
