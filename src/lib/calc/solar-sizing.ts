import {
  ABSOLUTE_MAX_DC_AC_RATIO,
  KWP_ROUNDING_STEP,
  MAX_RECOMMENDED_KWP,
  MIN_RECOMMENDED_KWP,
} from "@/config/constants";

export function roundKwp(kwp: number): number {
  return Math.round(kwp / KWP_ROUNDING_STEP) * KWP_ROUNDING_STEP;
}

export function clampKwp(kwp: number): number {
  return Math.min(MAX_RECOMMENDED_KWP, Math.max(MIN_RECOMMENDED_KWP, kwp));
}

/**
 * Reference sizing: the array that would produce the desired annual energy.
 * desiredAnnualKwh / specific yield = kWp
 */
export function referenceKwpFromConsumption(
  desiredAnnualKwh: number,
  annualKwhPerKwp: number,
): number {
  if (annualKwhPerKwp <= 0) return 0;
  return desiredAnnualKwh / annualKwhPerKwp;
}

/**
 * The array may never exceed the absolute DC/AC ceiling relative to the
 * maximum AC power the grid connection allows.
 */
export function maxKwpFromGridLimit(maxAcPowerKw: number): number {
  return maxAcPowerKw * ABSOLUTE_MAX_DC_AC_RATIO;
}

export function maxKwpForInverter(inverterKw: number): number {
  return inverterKw * ABSOLUTE_MAX_DC_AC_RATIO;
}

export interface ArraySizing {
  referenceKwp: number;
  recommendedKwp: number;
  limitedByGrid: boolean;
}

export function recommendArraySize(params: {
  desiredAnnualKwh: number;
  annualKwhPerKwp: number;
  maxAcPowerKw: number;
}): ArraySizing {
  const referenceKwp = referenceKwpFromConsumption(
    params.desiredAnnualKwh,
    params.annualKwhPerKwp,
  );
  const gridCeiling = maxKwpFromGridLimit(params.maxAcPowerKw);
  const limited = referenceKwp > gridCeiling;
  const recommendedKwp = clampKwp(roundKwp(Math.min(referenceKwp, gridCeiling)));
  return {
    referenceKwp,
    recommendedKwp,
    limitedByGrid: limited,
  };
}
