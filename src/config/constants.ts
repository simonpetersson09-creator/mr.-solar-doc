/**
 * Central calculation assumptions.
 * No magic numbers may live in components or calculation functions.
 */

/** European three-phase 400 V: kW allowed per ampere of main fuse. */
export const EU_THREE_PHASE_KW_PER_AMP = 0.69;

/** Default target DC/AC ratio window (used when no profile signal exists). */
export const TARGET_MIN_DC_AC_RATIO = 1.1;
export const TARGET_MAX_DC_AC_RATIO = 1.2;

/** Hard ceiling for automatic oversizing. Never a goal — only a limit. */
export const ABSOLUTE_MAX_DC_AC_RATIO = 1.3;

/** Months counted as the solar season (0 = January). April..September. */
export const SOLAR_SEASON_MONTH_INDEXES = [3, 4, 5, 6, 7, 8] as const;

/**
 * Thresholds on the PVGIS-weighted solar alignment index.
 * 1.0 = consumption spread like a flat profile.
 */
export const SOLAR_ALIGNMENT_THRESHOLDS = {
  low: 0.92,
  high: 1.08,
  veryHigh: 1.2,
} as const;

/** Desired DC/AC window per consumption profile. Bounded by the hard ceiling. */
export const DC_AC_TARGET_RANGES = {
  unknown: { min: 1.1, max: 1.15 },
  normal: { min: 1.1, max: 1.15 },
  "low-solar-season": { min: 1.0, max: 1.1 },
  "high-solar-season": { min: 1.15, max: 1.2 },
  "very-high-solar-season": { min: 1.2, max: ABSOLUTE_MAX_DC_AC_RATIO },
} as const;

/** How many rounding steps below the motivated array size we test candidates. */
export const CANDIDATE_KWP_STEPS_BELOW_TARGET = 6;

/** Relative weights used when scoring candidate systems (lower score wins). */
export const SCORE_WEIGHTS = {
  ratioOutsideRange: 12,
  ratioCentering: 1.5,
  arrayShortfall: 3,
} as const;


/** Default split between self-consumed and exported solar electricity. */
export const DEFAULT_SELF_CONSUMPTION_SHARE = 0.5;

/** Smallest / largest plausible residential array (kWp). */
export const MIN_RECOMMENDED_KWP = 1;
export const MAX_RECOMMENDED_KWP = 100;

/** Rounding step used when presenting a recommended array size (kWp). */
export const KWP_ROUNDING_STEP = 0.5;

/** Assumed nameplate wattage of a single solar panel (kWp), used to estimate panel count. */
export const PANEL_WATTAGE_KWP = 0.43;

/** Accepted simple payback time (years) used for the max-investment guide. */
export const DEFAULT_PAYBACK_YEARS = 12;
export const MIN_PAYBACK_YEARS = 8;
export const MAX_PAYBACK_YEARS = 20;

export const CALCULATION_VERSION = "1.0.0";
