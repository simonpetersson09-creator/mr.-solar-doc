import {
  ABSOLUTE_MAX_DC_AC_RATIO,
  TARGET_MAX_DC_AC_RATIO,
  TARGET_MIN_DC_AC_RATIO,
} from "@/config/constants";

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

/**
 * Pick a commercially available inverter that:
 *  - never exceeds the AC power allowed by the main fuse
 *  - preferably lands within the target DC/AC window (1.10 - 1.20)
 *  - never exceeds the absolute DC/AC ceiling (1.30)
 */
export function recommendInverter(params: {
  installedKwp: number;
  maxAcPowerKw: number;
  inverterSizesKw: number[];
}): { inverterKw: number; withinTargetWindow: boolean } {
  const allowed = params.inverterSizesKw
    .filter((kw) => kw <= params.maxAcPowerKw)
    .sort((a, b) => a - b);

  if (allowed.length === 0) {
    const smallest = Math.min(...params.inverterSizesKw);
    return { inverterKw: smallest, withinTargetWindow: false };
  }

  const inTarget = allowed.filter((kw) => {
    const ratio = dcAcRatio(params.installedKwp, kw);
    return ratio >= TARGET_MIN_DC_AC_RATIO && ratio <= TARGET_MAX_DC_AC_RATIO;
  });
  if (inTarget.length > 0) {
    return { inverterKw: inTarget[inTarget.length - 1], withinTargetWindow: true };
  }

  const withinCeiling = allowed.filter(
    (kw) => dcAcRatio(params.installedKwp, kw) <= ABSOLUTE_MAX_DC_AC_RATIO,
  );
  if (withinCeiling.length > 0) {
    // Smallest inverter that still keeps the ratio under the ceiling.
    return { inverterKw: withinCeiling[0], withinTargetWindow: false };
  }

  // Array is larger than any allowed inverter can carry: use the largest allowed.
  return { inverterKw: allowed[allowed.length - 1], withinTargetWindow: false };
}

/** Largest array (kWp) the chosen inverter may carry under the ceiling. */
export function maxArrayForInverter(inverterKw: number): number {
  return inverterKw * ABSOLUTE_MAX_DC_AC_RATIO;
}
