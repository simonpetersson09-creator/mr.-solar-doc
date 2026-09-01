import { DEFAULT_SELF_CONSUMPTION_SHARE } from "@/config/constants";

/**
 * How the self-consumption split was determined.
 * Ordered by data quality: actual metered data > simulated from a profile >
 * standard assumption. "user-override" means the user set the share manually.
 */
export type SelfConsumptionSource =
  | "actual-data"
  | "simulated"
  | "standard-assumption"
  | "user-override";

/** Consumer-facing self-consumption summary, derived once in the engine. */
export interface SelfConsumptionSummary {
  selfConsumedKwh: number;
  exportedKwh: number;
  /** selfConsumedKwh / annual solar production. */
  selfConsumptionRate: number;
  /** selfConsumedKwh / annual electricity consumption. Never mixed up with the above. */
  selfSufficiencyRate: number;
  selfConsumptionSource: SelfConsumptionSource;
}

export interface SelfConsumptionSplit {
  selfConsumptionShare: number;
  exportShare: number;
  selfConsumptionKwh: number;
  exportedKwh: number;
}

export function clampShare(share: number): number {
  if (!Number.isFinite(share)) return DEFAULT_SELF_CONSUMPTION_SHARE;
  return Math.min(1, Math.max(0, share));
}

/**
 * Builds the summary from an already-computed split.
 * No hourly (8760) model exists yet, so the source is a standard assumption
 * unless the user overrode the share. When a real simulation is added, only
 * the source and the share need to change — presentation stays untouched.
 */
export function summariseSelfConsumption(params: {
  split: SelfConsumptionSplit;
  annualProductionKwh: number;
  annualConsumptionKwh: number;
  source: SelfConsumptionSource;
}): SelfConsumptionSummary {
  const { split, annualProductionKwh, annualConsumptionKwh } = params;
  // Both rates are physically bounded by 1. The energy amount is already
  // capped in splitProduction; clamping here is a defensive second line.
  const selfConsumptionRate =
    annualProductionKwh > 0
      ? Math.min(1, split.selfConsumptionKwh / annualProductionKwh)
      : 0;
  const selfSufficiencyRate =
    annualConsumptionKwh > 0
      ? Math.min(1, split.selfConsumptionKwh / annualConsumptionKwh)
      : 0;
  return {
    selfConsumedKwh: split.selfConsumptionKwh,
    exportedKwh: split.exportedKwh,
    selfConsumptionRate,
    selfSufficiencyRate,
    selfConsumptionSource: params.source,
  };
}


/**
 * Shares always sum to 100 %.
 *
 * Physical invariant: a household can never self-consume more energy than it
 * actually uses, nor more than the array produces. When `annualConsumptionKwh`
 * is supplied, the *energy amount* is capped and the effective share is
 * recomputed from it — capping only the presented percentage would leave the
 * economics and the lifetime projection wrong.
 */
export function splitProduction(
  annualProductionKwh: number,
  selfConsumptionShare: number = DEFAULT_SELF_CONSUMPTION_SHARE,
  annualConsumptionKwh?: number | null,
): SelfConsumptionSplit {
  const production = Number.isFinite(annualProductionKwh)
    ? Math.max(0, annualProductionKwh)
    : 0;
  const self = clampShare(selfConsumptionShare);

  const consumptionCap =
    annualConsumptionKwh != null && Number.isFinite(annualConsumptionKwh)
      ? Math.max(0, annualConsumptionKwh)
      : Number.POSITIVE_INFINITY;

  const selfConsumptionKwh = Math.min(production * self, production, consumptionCap);
  const exportedKwh = production - selfConsumptionKwh;
  const effectiveShare = production > 0 ? selfConsumptionKwh / production : 0;

  return {
    selfConsumptionShare: effectiveShare,
    exportShare: 1 - effectiveShare,
    selfConsumptionKwh,
    exportedKwh,
  };
}

/**
 * NOT USED BY THE ENGINE TODAY — kept deliberately as future work.
 *
 * Prepared for a future, smarter estimate: when monthly consumption is known,
 * self-consumption can be bounded month by month. Returns null when monthly
 * data is unavailable, so callers keep using the user/default share.
 *
 * Caveat before wiring it in: a monthly overlap systematically OVERESTIMATES
 * self-consumption, because within a month production and consumption do not
 * coincide hour by hour. An hourly model (or a monthly correction factor) is
 * required first. Behaviour is pinned by self-consumption.test.ts.
 */
export function estimateSelfConsumptionShareFromMonthlyData(
  monthlyProductionKwh: number[],
  monthlyConsumptionKwh: number[] | null,
): number | null {
  if (!monthlyConsumptionKwh || monthlyConsumptionKwh.length !== 12) return null;
  const total = monthlyProductionKwh.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return null;
  const overlap = monthlyProductionKwh.reduce(
    (sum, production, index) => sum + Math.min(production, monthlyConsumptionKwh[index] ?? 0),
    0,
  );
  return clampShare(overlap / total);
}

/* ------------------------------------------------------------------ *
 * Dynamic self-consumption estimate
 * ------------------------------------------------------------------ */

/**
 * Time profile of the household load. Deliberately about WHEN electricity is
 * used, not about lifestyle. Not exposed in the wizard yet — the API exists so
 * an optional step-5 question can be added without touching the engine.
 */
export type LoadProfileClass = "evening" | "mixed" | "daytime";

/** Multipliers applied to the base curve. Mixed is the neutral default. */
const PROFILE_FACTOR: Record<LoadProfileClass, number> = {
  evening: 0.85,
  mixed: 1,
  daytime: 1.3,
};

/**
 * Base curve: share = A * ratio^(-B), ratio = annualProduction / annualConsumption.
 *
 * Why a power law: self-consumption falls smoothly and monotonically as the
 * array grows relative to the load, with no breakpoints — a small change in
 * system size can never cause a jump. Two parameters keep it explainable.
 *
 * Calibration: anchored on two points of the synthetic hourly reference
 * (ratio 0.2 -> ~60 %, ratio 2.0 -> ~15 %), which gives B = ln(4)/ln(10) ≈ 0.60
 * and A ≈ 0.23. The curve is then intentionally left slightly BELOW the
 * reference in the mid range (ratio 0.5 -> 35 % vs 38 %; ratio 1.0 -> 23 % vs
 * 25 %) rather than refitted, because the reference itself is synthetic and
 * over-estimating self-consumption over-states the economics. Conservative
 * beats precise here.
 */
const SC_CURVE_A = 0.23;
const SC_CURVE_B = 0.6;
/** Even a tiny array is never fully self-consumed (night load, summer surplus). */
const SC_MAX_SHARE = 0.85;
/** A very large array still covers some base load. */
const SC_MIN_SHARE = 0.05;

export interface SelfConsumptionEstimate {
  share: number;
  source: SelfConsumptionSource;
  /** annualProduction / annualConsumption used by the curve, null when unusable. */
  solarToLoadRatio: number | null;
  /** Monthly overlap upper bound, when monthly data was available. */
  monthlyUpperBound: number | null;
}

/**
 * Pure model share for a given production/consumption ratio.
 * Robust against 0, negative, NaN and Infinity inputs.
 */
export function modelSelfConsumptionShare(
  annualProductionKwh: number,
  annualConsumptionKwh: number,
  profileClass: LoadProfileClass = "mixed",
): number {
  const production = Number.isFinite(annualProductionKwh) ? Math.max(0, annualProductionKwh) : 0;
  const consumption = Number.isFinite(annualConsumptionKwh) ? Math.max(0, annualConsumptionKwh) : 0;
  // Nothing produced, or no load at all: the physical split in splitProduction
  // resolves these to 0 kWh anyway; return the bounded extremes explicitly.
  if (production <= 0) return SC_MAX_SHARE;
  if (consumption <= 0) return 0;

  const ratio = production / consumption;
  if (!Number.isFinite(ratio) || ratio <= 0) return SC_MIN_SHARE;

  const raw = SC_CURVE_A * Math.pow(ratio, -SC_CURVE_B) * (PROFILE_FACTOR[profileClass] ?? 1);
  if (!Number.isFinite(raw)) return SC_MAX_SHARE;
  return Math.min(SC_MAX_SHARE, Math.max(SC_MIN_SHARE, raw));
}

/**
 * Single decision point for which share the engine uses.
 *
 * Priority: 1) user override, 2) modelled estimate, 3) safe bounds.
 * Monthly data is used ONLY as an upper bound (Σ min(prod, cons) / Σ prod is
 * the best case at monthly resolution and can never be the actual rate), so it
 * can lower the estimate but never make it more optimistic.
 */
export function resolveSelfConsumptionShare(params: {
  annualProductionKwh: number;
  annualConsumptionKwh: number;
  userShare?: number | null;
  userSet?: boolean;
  monthlyProductionKwh?: number[] | null;
  monthlyConsumptionKwh?: number[] | null;
  profileClass?: LoadProfileClass;
}): SelfConsumptionEstimate {
  const production = Number.isFinite(params.annualProductionKwh)
    ? Math.max(0, params.annualProductionKwh)
    : 0;
  const consumption = Number.isFinite(params.annualConsumptionKwh)
    ? Math.max(0, params.annualConsumptionKwh)
    : 0;
  const solarToLoadRatio = consumption > 0 && production > 0 ? production / consumption : null;

  if (params.userSet && params.userShare != null && Number.isFinite(params.userShare)) {
    return {
      share: clampShare(params.userShare),
      source: "user-override",
      solarToLoadRatio,
      monthlyUpperBound: null,
    };
  }

  const modelled = modelSelfConsumptionShare(production, consumption, params.profileClass);
  const monthlyUpperBound =
    params.monthlyProductionKwh && params.monthlyProductionKwh.length === 12
      ? estimateSelfConsumptionShareFromMonthlyData(
          params.monthlyProductionKwh,
          params.monthlyConsumptionKwh ?? null,
        )
      : null;

  const share =
    monthlyUpperBound != null ? Math.min(modelled, clampShare(monthlyUpperBound)) : modelled;

  return {
    share: clampShare(share),
    source: "simulated",
    solarToLoadRatio,
    monthlyUpperBound,
  };
}
