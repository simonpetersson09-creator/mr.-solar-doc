/**
 * Candidate-based system selection.
 *
 * A candidate is a PHYSICAL system: a whole number of panels on a commercially
 * available inverter. The search is exhaustive over every physically possible
 * combination inside the technical limits, so the winner is the global optimum
 * of the scoring model — not the best member of a narrow window.
 *
 * Source of truth for system size:
 *   installedKwp = panelCount x panelPowerKwp
 */

import {
  ABSOLUTE_MAX_DC_AC_RATIO,
  MAX_RECOMMENDED_KWP,
  MIN_RECOMMENDED_KWP,
  SCORE_WEIGHTS,
} from "@/config/constants";
import { annualProduction, monthlyProduction } from "./energy-production";
import { dcAcRatio } from "./inverter-sizing";
import { calculateSolarSeasonConsumption } from "./consumption-profile";
import type { DcAcTargetRange } from "./consumption-profile";

/** Floating point slack used for ratio comparisons and score ties. */
export const SELECTION_TOLERANCE = 1e-9;

export interface SystemCandidate {
  /** Whole number of modules. The physical source of truth. */
  panelCount: number;
  /** Nameplate power of one module (kWp). */
  panelPowerKwp: number;
  /** Always exactly panelCount x panelPowerKwp. */
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
  panelCount: number;
  panelPowerKwp: number;
  inverterKw: number;
  targetKwp: number;
  targetRange: DcAcTargetRange;
  monthlyKwhPerKwp: number[];
  annualConsumptionKwh: number;
  monthlyConsumptionKwh: number[] | null;
  solarSeasonProductionShare: number;
}): SystemCandidate | null {
  const installedKwp = params.panelCount * params.panelPowerKwp;
  const ratio = dcAcRatio(installedKwp, params.inverterKw);
  if (ratio > ABSOLUTE_MAX_DC_AC_RATIO + SELECTION_TOLERANCE) return null;

  const monthlyProductionKwh = monthlyProduction(params.monthlyKwhPerKwp, installedKwp);
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

  // Stay as close as possible to the motivated array size: undershooting wastes
  // roof potential, overshooting sells the household a system it cannot use.
  const shortfall =
    params.targetKwp > 0
      ? Math.max(0, params.targetKwp - installedKwp) / params.targetKwp
      : 0;
  const oversize =
    params.targetKwp > 0
      ? Math.max(0, installedKwp - params.targetKwp) / params.targetKwp
      : 0;
  const sizePenalty =
    shortfall * SCORE_WEIGHTS.arrayShortfall + oversize * SCORE_WEIGHTS.arrayOversize;

  return {
    panelCount: params.panelCount,
    panelPowerKwp: params.panelPowerKwp,
    installedKwp,
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
  status: "ok";
  best: SystemCandidate;
  candidates: SystemCandidate[];
  /** True when the winning candidate landed inside the desired DC/AC window. */
  withinTargetRange: boolean;
  /** Set when the winner missed the window; says on which side it missed. */
  targetRangeMiss: "below" | "above" | null;
}

/**
 * Controlled domain outcome: the connection cannot carry even the smallest
 * supported inverter. This is a real-world situation, not a broken calculation,
 * so it must never surface as a validation error.
 */
export interface GridTooSmallResult {
  status: "grid-too-small";
  maxAcPowerKw: number;
  minimumSupportedInverterKw: number;
}

export type SelectionOutcome = SelectionResult | GridTooSmallResult;

/**
 * Deterministic tie-breaking, applied in order (all comparisons use
 * SELECTION_TOLERANCE):
 *   1. lowest score
 *   2. smallest distance from the target DC/AC window centre
 *   3. smallest distance from the reference array size
 *   4. smaller installed DC power
 *   5. smaller inverter
 */
function compareCandidates(
  a: SystemCandidate,
  b: SystemCandidate,
  mid: number,
  referenceKwp: number,
): number {
  if (Math.abs(a.score - b.score) > SELECTION_TOLERANCE) return a.score - b.score;

  const centerA = Math.abs(a.dcAcRatio - mid);
  const centerB = Math.abs(b.dcAcRatio - mid);
  if (Math.abs(centerA - centerB) > SELECTION_TOLERANCE) return centerA - centerB;

  const refA = Math.abs(a.installedKwp - referenceKwp);
  const refB = Math.abs(b.installedKwp - referenceKwp);
  if (Math.abs(refA - refB) > SELECTION_TOLERANCE) return refA - refB;

  if (Math.abs(a.installedKwp - b.installedKwp) > SELECTION_TOLERANCE) {
    return a.installedKwp - b.installedKwp;
  }
  return a.inverterKw - b.inverterKw;
}

export function selectRecommendedSystem(params: {
  targetKwp: number;
  /** Continuous energy-parity anchor; used only for tie-breaking. */
  referenceKwp?: number;
  maxAcPowerKw: number;
  inverterSizesKw: number[];
  panelPowerKwp: number;
  targetRange: DcAcTargetRange;
  monthlyKwhPerKwp: number[];
  annualConsumptionKwh: number;
  monthlyConsumptionKwh: number[] | null;
  solarSeasonProductionShare: number;
}): SelectionOutcome {
  const panel = params.panelPowerKwp;
  const positiveSizes = params.inverterSizesKw.filter((kw) => kw > 0);
  const inverters = positiveSizes
    .filter((kw) => kw <= params.maxAcPowerKw + SELECTION_TOLERANCE)
    .sort((a, b) => a - b);

  if (inverters.length === 0 || panel <= 0) {
    return {
      status: "grid-too-small",
      maxAcPowerKw: params.maxAcPowerKw,
      minimumSupportedInverterKw: positiveSizes.length > 0 ? Math.min(...positiveSizes) : 0,
    };
  }

  // Panel counts are bounded by the smallest supported array and by the
  // largest plausible residential array.
  const minPanelCount = Math.max(
    1,
    Math.ceil((MIN_RECOMMENDED_KWP - SELECTION_TOLERANCE) / panel),
  );
  const globalMaxPanelCount = Math.floor(
    (MAX_RECOMMENDED_KWP + SELECTION_TOLERANCE) / panel,
  );

  const { min, max } = params.targetRange;
  const mid = (min + max) / 2;
  const referenceKwp = params.referenceKwp ?? params.targetKwp;

  const candidates: SystemCandidate[] = [];
  let best: SystemCandidate | null = null;

  for (const inverterKw of inverters) {
    // Hard DC/AC ceiling expressed in whole panels.
    const ratioMaxPanels = Math.floor(
      (inverterKw * ABSOLUTE_MAX_DC_AC_RATIO + SELECTION_TOLERANCE) / panel,
    );
    // Above BOTH the target size and the top of the DC/AC window every extra
    // panel only increases the penalties, so the search can stop there.
    const searchMaxPanels = Math.max(
      Math.ceil((params.targetKwp - SELECTION_TOLERANCE) / panel) + 1,
      Math.floor((inverterKw * max) / panel) + 1,
      minPanelCount,
    );
    const maxPanelCount = Math.min(ratioMaxPanels, globalMaxPanelCount, searchMaxPanels);

    for (let panelCount = minPanelCount; panelCount <= maxPanelCount; panelCount += 1) {
      const candidate = evaluateSystemCandidate({
        panelCount,
        panelPowerKwp: panel,
        inverterKw,
        targetKwp: params.targetKwp,
        targetRange: params.targetRange,
        monthlyKwhPerKwp: params.monthlyKwhPerKwp,
        annualConsumptionKwh: params.annualConsumptionKwh,
        monthlyConsumptionKwh: params.monthlyConsumptionKwh,
        solarSeasonProductionShare: params.solarSeasonProductionShare,
      });
      if (!candidate) continue;
      candidates.push(candidate);
      if (!best || compareCandidates(candidate, best, mid, referenceKwp) < 0) {
        best = candidate;
      }
    }
  }

  if (!best) {
    // Only reachable when even one panel exceeds the DC/AC ceiling of every
    // allowed inverter, i.e. the connection is too small for a real system.
    return {
      status: "grid-too-small",
      maxAcPowerKw: params.maxAcPowerKw,
      minimumSupportedInverterKw: inverters[0]!,
    };
  }

  const withinTargetRange =
    best.dcAcRatio >= min - SELECTION_TOLERANCE && best.dcAcRatio <= max + SELECTION_TOLERANCE;

  const targetRangeMiss: "below" | "above" | null = withinTargetRange
    ? null
    : best.dcAcRatio < min
      ? "below"
      : "above";

  return { status: "ok", best, candidates, withinTargetRange, targetRangeMiss };
}
