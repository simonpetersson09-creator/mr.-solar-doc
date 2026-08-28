/**
 * Candidate-based system selection.
 *
 * Instead of picking a DC/AC ratio first and then sizing, we build a set of
 * realistic (kWp, commercial inverter) combinations, evaluate each against the
 * technical limits and the user's consumption profile, and pick the best.
 */

import {
  ABSOLUTE_MAX_DC_AC_RATIO,
  CANDIDATE_KWP_STEPS_BELOW_TARGET,
  SCORE_WEIGHTS,
} from "@/config/constants";
import { annualProduction, monthlyProduction } from "./energy-production";
import { dcAcRatio } from "./inverter-sizing";
import { clampKwp, roundKwp } from "./solar-sizing";
import { calculateSolarSeasonConsumption } from "./consumption-profile";
import type { DcAcTargetRange } from "./consumption-profile";

export interface SystemCandidate {
  installedKwp: number;
  inverterKw: number;
  dcAcRatio: number;
  annualProductionKwh: number;
  monthlyProductionKwh: number[];
  /** Annual production relative to annual consumption (1 = parity). */
  productionCoverage: number;
  /** Solar-season production relative to solar-season consumption, when known. */
  solarSeasonCoverage: number | null;
  /** Lower is better. */
  score: number;
}

export function evaluateSystemCandidate(params: {
  installedKwp: number;
  inverterKw: number;
  targetKwp: number;
  targetRange: DcAcTargetRange;
  monthlyKwhPerKwp: number[];
  annualConsumptionKwh: number;
  monthlyConsumptionKwh: number[] | null;
  solarSeasonProductionShare: number;
}): SystemCandidate | null {
  const ratio = dcAcRatio(params.installedKwp, params.inverterKw);
  if (ratio > ABSOLUTE_MAX_DC_AC_RATIO + 1e-9) return null;

  const monthlyProductionKwh = monthlyProduction(
    params.monthlyKwhPerKwp,
    params.installedKwp,
  );
  const annualProductionKwh = annualProduction(monthlyProductionKwh);

  const productionCoverage =
    params.annualConsumptionKwh > 0 ? annualProductionKwh / params.annualConsumptionKwh : 0;

  let solarSeasonCoverage: number | null = null;
  if (params.monthlyConsumptionKwh) {
    const seasonConsumption = calculateSolarSeasonConsumption(params.monthlyConsumptionKwh);
    const seasonProduction = annualProductionKwh * params.solarSeasonProductionShare;
    solarSeasonCoverage = seasonConsumption > 0 ? seasonProduction / seasonConsumption : null;
  }

  const { min, max } = params.targetRange;
  const mid = (min + max) / 2;

  // Distance outside the desired window is the dominant penalty.
  const outside = ratio < min ? min - ratio : ratio > max ? ratio - max : 0;
  const ratioPenalty = outside * SCORE_WEIGHTS.ratioOutsideRange;
  // Small pull towards the middle of the window so 1.30 is never a "goal"
  // and the smallest allowed inverter is not picked by default.
  const centeringPenalty = Math.abs(ratio - mid) * SCORE_WEIGHTS.ratioCentering;

  // Prefer using as much of the motivated array size as possible.
  const shortfall =
    params.targetKwp > 0
      ? Math.max(0, params.targetKwp - params.installedKwp) / params.targetKwp
      : 0;
  const sizePenalty = shortfall * SCORE_WEIGHTS.arrayShortfall;

  return {
    installedKwp: params.installedKwp,
    inverterKw: params.inverterKw,
    dcAcRatio: ratio,
    annualProductionKwh,
    monthlyProductionKwh,
    productionCoverage,
    solarSeasonCoverage,
    score: ratioPenalty + centeringPenalty + sizePenalty,
  };
}

export interface SelectionResult {
  best: SystemCandidate;
  candidates: SystemCandidate[];
  /** True when the winning candidate landed inside the desired DC/AC window. */
  withinTargetRange: boolean;
}

export function selectRecommendedSystem(params: {
  targetKwp: number;
  maxAcPowerKw: number;
  inverterSizesKw: number[];
  targetRange: DcAcTargetRange;
  monthlyKwhPerKwp: number[];
  annualConsumptionKwh: number;
  monthlyConsumptionKwh: number[] | null;
  solarSeasonProductionShare: number;
  kwpStep: number;
}): SelectionResult {
  const allowedInverters = params.inverterSizesKw
    .filter((kw) => kw > 0 && kw <= params.maxAcPowerKw + 1e-9)
    .sort((a, b) => a - b);
  const inverters =
    allowedInverters.length > 0
      ? allowedInverters
      : [Math.min(...params.inverterSizesKw.filter((kw) => kw > 0))];

  const kwpOptions: number[] = [];
  for (let step = 0; step <= CANDIDATE_KWP_STEPS_BELOW_TARGET; step += 1) {
    const kwp = clampKwp(roundKwp(params.targetKwp - step * params.kwpStep));
    if (kwp > 0 && !kwpOptions.includes(kwp)) kwpOptions.push(kwp);
  }

  const candidates: SystemCandidate[] = [];
  for (const kwp of kwpOptions) {
    for (const inverterKw of inverters) {
      const candidate = evaluateSystemCandidate({
        installedKwp: kwp,
        inverterKw,
        targetKwp: params.targetKwp,
        targetRange: params.targetRange,
        monthlyKwhPerKwp: params.monthlyKwhPerKwp,
        annualConsumptionKwh: params.annualConsumptionKwh,
        monthlyConsumptionKwh: params.monthlyConsumptionKwh,
        solarSeasonProductionShare: params.solarSeasonProductionShare,
      });
      if (candidate) candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    // Array cannot be carried by any allowed inverter: fall back to the
    // largest allowed inverter at the ceiling ratio.
    const inverterKw = inverters[inverters.length - 1]!;
    const installedKwp = clampKwp(roundKwp(inverterKw * ABSOLUTE_MAX_DC_AC_RATIO));
    const monthlyProductionKwh = monthlyProduction(params.monthlyKwhPerKwp, installedKwp);
    const annualProductionKwh = annualProduction(monthlyProductionKwh);
    const fallback: SystemCandidate = {
      installedKwp,
      inverterKw,
      dcAcRatio: dcAcRatio(installedKwp, inverterKw),
      annualProductionKwh,
      monthlyProductionKwh,
      productionCoverage:
        params.annualConsumptionKwh > 0
          ? annualProductionKwh / params.annualConsumptionKwh
          : 0,
      solarSeasonCoverage: null,
      score: Number.POSITIVE_INFINITY,
    };
    return { best: fallback, candidates: [fallback], withinTargetRange: false };
  }

  candidates.sort((a, b) => a.score - b.score || b.installedKwp - a.installedKwp);
  const best = candidates[0]!;
  const withinTargetRange =
    best.dcAcRatio >= params.targetRange.min - 1e-9 &&
    best.dcAcRatio <= params.targetRange.max + 1e-9;

  return { best, candidates, withinTargetRange };
}
