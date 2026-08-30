/**
 * Central calculation assumptions.
 * No magic numbers may live in components or calculation functions.
 */

/**
 * Grid connection assumption shared by every supported market: 400 V three-phase.
 * This is a calculation assumption, not a guarantee about a specific property.
 */
export const EU_GRID_VOLTAGE_V = 400;
export const EU_GRID_PHASES = 3;

/**
 * European three-phase 400 V: kW allowed per ampere of main fuse.
 * P(kW) = sqrt(3) x 400 x A / 1000 ~= 0.69 x A.
 */
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

/**
 * How many rounding steps ABOVE the motivated array size we test candidates.
 * Needed for small arrays, where the smallest available inverter would
 * otherwise force a severely under-sized DC/AC ratio.
 */
export const CANDIDATE_KWP_STEPS_ABOVE_TARGET = 2;

/** Relative weights used when scoring candidate systems (lower score wins). */
export const SCORE_WEIGHTS = {
  ratioOutsideRange: 12,
  ratioCentering: 1.5,
  arrayShortfall: 3,
} as const;


/**
 * Relative monthly weights (Jan..Dec) used to estimate a monthly consumption
 * profile from an annual figure. Always normalised before use.
 */
export const CONSUMPTION_SHAPE_WEIGHTS = {
  even: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  "winter-heavy": [13, 11, 10, 8, 6, 5, 5, 5, 7, 9, 10, 11],
  "summer-heavy": [6, 6, 7, 8, 10, 11, 12, 11, 9, 7, 6, 7],
  /** Neutral fallback used for "I don't know". Overridable per market. */
  default: [11, 10, 9.5, 8, 6.5, 5.5, 5.5, 5.5, 7, 9, 10, 12],
} as const satisfies Record<string, readonly number[]>;

/** Default split between self-consumed and exported solar electricity. */
export const DEFAULT_SELF_CONSUMPTION_SHARE = 0.5;


/** Smallest / largest plausible residential array (kWp). */
export const MIN_RECOMMENDED_KWP = 1;
export const MAX_RECOMMENDED_KWP = 100;

/** Lowest annual consumption the engine treats as a realistic household. */
export const MIN_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH = 100;

/**
 * When the selected array exceeds the consumption-based target by more than
 * this factor, the size is driven by the smallest available inverter.
 */
export const MINIMUM_SIZE_NOTE_FACTOR = 1.25;

/** Rounding step used when presenting a recommended array size (kWp). */
export const KWP_ROUNDING_STEP = 0.5;

/** Assumed nameplate wattage of a single solar panel (kWp), used to estimate panel count. */
export const PANEL_WATTAGE_KWP = 0.43;

/** Accepted simple payback time (years) used for the max-investment guide. */
export const DEFAULT_PAYBACK_YEARS = 12;
export const MIN_PAYBACK_YEARS = 8;
export const MAX_PAYBACK_YEARS = 20;

export const CALCULATION_VERSION = "1.0.0";

/**
 * Long-term production degradation, per year.
 * Central calculation assumption — never duplicate this value elsewhere.
 */
export const DEFAULT_ANNUAL_SOLAR_DEGRADATION = 0.005;

/** Length of the long-term economic calculation period, in years. */
export const LONG_TERM_CALCULATION_YEARS = 30;

/**
 * Electricity price development scenarios (annual compound change).
 * Scenarios/assumptions — never presented as forecasts.
 */
export const PRICE_SCENARIO_RATES = {
  flat: 0,
  cautious: 0.01,
  normal: 0.02,
  high: 0.03,
  custom: 0.02,
} as const;

export type PriceScenarioId = keyof typeof PRICE_SCENARIO_RATES;

export const DEFAULT_PRICE_SCENARIO: PriceScenarioId = "normal";

/** Bounds for a user-entered annual price change, in percent. */
export const MIN_CUSTOM_PRICE_CHANGE_PERCENT = -10;
export const MAX_CUSTOM_PRICE_CHANGE_PERCENT = 20;
