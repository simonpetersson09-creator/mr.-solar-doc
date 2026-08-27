import { DEFAULT_SELF_CONSUMPTION_SHARE } from "@/config/constants";

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
