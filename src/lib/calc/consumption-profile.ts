/**
 * Consumption profile analysis.
 *
 * Turns the user's monthly consumption (when available) and the location's
 * PVGIS monthly production profile into a dimensioning *signal* that shifts
 * the desired DC/AC window.
 *
 * IMPORTANT: monthly data is not hourly data. It cannot tell us whether the
 * electricity is used during daylight hours, so the result is only used as a
 * sizing hint — never as proof of simultaneous production and consumption.
 * The interfaces below are shaped so that an hourly/quarter-hourly profile can
 * later produce the same analysis object.
 */

import {
  DC_AC_TARGET_RANGES,
  SOLAR_ALIGNMENT_THRESHOLDS,
  SOLAR_SEASON_MONTH_INDEXES,
} from "@/config/constants";

export type ConsumptionProfileCategory =
  | "unknown"
  | "low-solar-season"
  | "normal"
  | "high-solar-season"
  | "very-high-solar-season";

export interface DcAcTargetRange {
  min: number;
  max: number;
}

export interface ConsumptionProfileAnalysis {
  category: ConsumptionProfileCategory;
  /** True when a real 12-month consumption profile was available. */
  hasMonthlyData: boolean;
  /** Share of annual consumption falling in the solar season (Apr-Sep). */
  summerConsumptionShare: number;
  /** Share of annual PVGIS production falling in the same months. */
  summerProductionShare: number;
  /**
   * PVGIS-weighted alignment index. 1.0 = consumption spread exactly like a
   * flat profile; > 1 = consumption concentrated in high-production months.
   */
  solarAlignmentIndex: number;
  /** Resolution of the source data — prepared for "hourly" later. */
  resolution: "none" | "monthly";
}

function normalizeShares(values: number[]): number[] {
  const total = values.reduce((sum, v) => sum + (Number.isFinite(v) && v > 0 ? v : 0), 0);
  if (total <= 0) return values.map(() => 0);
  return values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0) / total);
}

/** Sum of the solar-season months (April-September by default). */
export function calculateSolarSeasonConsumption(monthlyKwh: number[]): number {
  return SOLAR_SEASON_MONTH_INDEXES.reduce(
    (sum, index) => sum + (monthlyKwh[index] ?? 0),
    0,
  );
}

export function analyzeConsumptionProfile(params: {
  monthlyConsumptionKwh: number[] | null;
  annualConsumptionKwh: number;
  monthlyKwhPerKwp: number[];
}): ConsumptionProfileAnalysis {
  const production = normalizeShares(params.monthlyKwhPerKwp ?? []);
  const summerProductionShare = SOLAR_SEASON_MONTH_INDEXES.reduce(
    (sum, index) => sum + (production[index] ?? 0),
    0,
  );

  const monthly = params.monthlyConsumptionKwh;
  const usable =
    Array.isArray(monthly) &&
    monthly.length === 12 &&
    monthly.every((v) => Number.isFinite(v) && v >= 0) &&
    monthly.reduce((s, v) => s + v, 0) > 0;

  if (!usable) {
    return {
      category: "unknown",
      hasMonthlyData: false,
      summerConsumptionShare: 0,
      summerProductionShare,
      solarAlignmentIndex: 1,
      resolution: "none",
    };
  }

  const consumptionShares = normalizeShares(monthly!);
  const summerConsumptionShare = SOLAR_SEASON_MONTH_INDEXES.reduce(
    (sum, index) => sum + (consumptionShares[index] ?? 0),
    0,
  );

  // Weight each month's consumption share by that month's production share.
  // A perfectly flat consumption profile yields exactly 1.0.
  const weighted = consumptionShares.reduce(
    (sum, share, index) => sum + share * (production[index] ?? 0),
    0,
  );
  const solarAlignmentIndex = weighted * 12;

  const t = SOLAR_ALIGNMENT_THRESHOLDS;
  let category: ConsumptionProfileCategory = "normal";
  if (solarAlignmentIndex < t.low) category = "low-solar-season";
  else if (solarAlignmentIndex >= t.veryHigh) category = "very-high-solar-season";
  else if (solarAlignmentIndex >= t.high) category = "high-solar-season";

  return {
    category,
    hasMonthlyData: true,
    summerConsumptionShare,
    summerProductionShare,
    solarAlignmentIndex,
    resolution: "monthly",
  };
}

/** Desired DC/AC window for a profile. Always bounded by the hard ceiling. */
export function determineTargetDcAcRange(
  category: ConsumptionProfileCategory,
): DcAcTargetRange {
  return DC_AC_TARGET_RANGES[category] ?? DC_AC_TARGET_RANGES.unknown;
}
