/**
 * Central calculation assumptions.
 * No magic numbers may live in components or calculation functions.
 */

/** European three-phase 400 V: kW allowed per ampere of main fuse. */
export const EU_THREE_PHASE_KW_PER_AMP = 0.69;

/** Target DC/AC ratio window for automatic recommendations. */
export const TARGET_MIN_DC_AC_RATIO = 1.1;
export const TARGET_MAX_DC_AC_RATIO = 1.2;

/** Hard ceiling for automatic oversizing. */
export const ABSOLUTE_MAX_DC_AC_RATIO = 1.3;

/** Default split between self-consumed and exported solar electricity. */
export const DEFAULT_SELF_CONSUMPTION_SHARE = 0.5;

/** Smallest / largest plausible residential array (kWp). */
export const MIN_RECOMMENDED_KWP = 1;
export const MAX_RECOMMENDED_KWP = 100;

/** Rounding step used when presenting a recommended array size (kWp). */
export const KWP_ROUNDING_STEP = 0.5;

export const CALCULATION_VERSION = "1.0.0";
