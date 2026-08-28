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
  return {
    selfConsumedKwh: split.selfConsumptionKwh,
    exportedKwh: split.exportedKwh,
    selfConsumptionRate:
      annualProductionKwh > 0 ? split.selfConsumptionKwh / annualProductionKwh : 0,
    selfSufficiencyRate:
      annualConsumptionKwh > 0 ? split.selfConsumptionKwh / annualConsumptionKwh : 0,
    selfConsumptionSource: params.source,
  };
}


/** Shares always sum to 100 %. */
export function splitProduction(
  annualProductionKwh: number,
  selfConsumptionShare: number = DEFAULT_SELF_CONSUMPTION_SHARE,
): SelfConsumptionSplit {
  const self = clampShare(selfConsumptionShare);
  return {
    selfConsumptionShare: self,
    exportShare: 1 - self,
    selfConsumptionKwh: annualProductionKwh * self,
    exportedKwh: annualProductionKwh * (1 - self),
  };
}

/**
 * Prepared for a future, smarter estimate: when monthly consumption is known,
 * self-consumption can be bounded month by month. Returns null when monthly
 * data is unavailable, so callers keep using the user/default share.
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
