/**
 * Estimated monthly consumption from an annual figure.
 *
 * Used only when the user has neither imported actual consumption data nor
 * entered 12 monthly values. The result is an *estimate* and must always be
 * labelled as such in UI and reports.
 */

import { CONSUMPTION_SHAPE_WEIGHTS } from "@/config/constants";
import { getHemisphere } from "@/lib/geo/hemisphere";

export type ConsumptionShape = "even" | "winter-heavy" | "summer-heavy" | "default";

/** Where the monthly consumption used in the calculation came from. */
export type ConsumptionInputType = "imported" | "monthly-manual" | "annual-profile" | "annual-only";

/**
 * Climate-band profiles for the "I don't know" case (Jan..Dec, northern
 * hemisphere). A single Nordic heating profile is wrong outside the cold
 * band: in Spain, Australia or Japan the load peaks in summer because of
 * cooling, which lands in the SAME months as the production peak. Rotating a
 * heating curve southwards would move the peak the wrong way there, so the
 * band is chosen from latitude first and only then rotated per hemisphere.
 * Values are relative; they are normalised before use.
 */
const CLIMATE_BAND_WEIGHTS = {
  /** |lat| >= 50 — heating dominated (Nordics, Baltics, Canada, Scotland). */
  cold: [11, 10, 9.5, 8, 6.5, 5.5, 5.5, 5.5, 7, 9, 10, 12],
  /** 40-50 — heating dominated with a small cooling bump. */
  temperate: [10.5, 9.8, 9.2, 8, 7, 6.3, 6.5, 6.5, 7.3, 8.6, 9.7, 10.6],
  /** 30-40 — Mediterranean/US south: two peaks, summer roughly as high. */
  warm: [9.2, 8.5, 8, 7.4, 7.6, 8.8, 10.4, 10.6, 8.9, 7.6, 7.7, 8.6],
  /** 23-30 — cooling dominated (Gulf states, southern AU, north Africa). */
  subtropical: [7.4, 7.2, 7.4, 7.8, 9, 10.6, 11.6, 11.6, 10, 8.4, 7.4, 7.6],
  /** < 23 — tropical: near-constant cooling load, hardly any season. */
  tropical: [8.1, 8.1, 8.4, 8.6, 8.8, 8.6, 8.4, 8.4, 8.4, 8.4, 8.1, 8.1],
} as const;

/** Picks the climate band from absolute latitude. */
function climateBandWeights(latitude: number): number[] {
  const abs = Math.abs(latitude);
  if (abs >= 50) return [...CLIMATE_BAND_WEIGHTS.cold];
  if (abs >= 40) return [...CLIMATE_BAND_WEIGHTS.temperate];
  if (abs >= 30) return [...CLIMATE_BAND_WEIGHTS.warm];
  if (abs >= 23) return [...CLIMATE_BAND_WEIGHTS.subtropical];
  return [...CLIMATE_BAND_WEIGHTS.tropical];
}

/** True when the market simply carries the generic default weights. */
function isGenericDefault(weights: number[] | null | undefined): boolean {
  if (!weights || weights.length !== 12) return true;
  return weights.every(
    (w, index) => Math.abs(w - (CONSUMPTION_SHAPE_WEIGHTS.default[index] ?? 0)) < 1e-9,
  );
}

/**
 * The stock weights describe a northern-hemisphere year (January = winter).
 * South of the equator the seasons are six months out of phase, so the shape
 * has to be rotated — otherwise the estimated consumption peak lands in the
 * same months as the production peak and self-consumption is overstated.
 * In the equatorial band there is no meaningful winter/summer, so seasonal
 * shapes are flattened towards an even year.
 */
function applyHemisphere(weights: number[], latitude?: number | null): number[] {
  if (latitude === undefined || latitude === null || !Number.isFinite(latitude)) return weights;
  const hemisphere = getHemisphere(latitude);
  if (hemisphere === "north") return weights;
  if (hemisphere === "south") {
    // Shift by six months: January behaves like July.
    return weights.map((_, index) => weights[(index + 6) % 12] ?? 0);
  }
  // Equatorial: blend heavily towards a flat profile.
  const flat = 1 / 12;
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  return weights.map((w) => 0.8 * flat + 0.2 * (w / total));
}

/** Normalised weights (sum = 1) for a shape, with an optional market default. */
export function getShapeWeights(
  shape: ConsumptionShape,
  marketDefaultWeights?: number[] | null,
  latitude?: number | null,
): number[] {
  const hasLatitude =
    latitude !== undefined && latitude !== null && Number.isFinite(latitude);
  // "I don't know" resolves to the climate band of the actual site, unless the
  // market defines its own measured profile. Explicit user choices
  // (winter/summer/even) are never re-classified, only rotated.
  const climateDefault =
    shape === "default" && hasLatitude && isGenericDefault(marketDefaultWeights)
      ? climateBandWeights(latitude as number)
      : null;
  const raw =
    climateDefault ??
    (shape === "default"
      ? (marketDefaultWeights ?? CONSUMPTION_SHAPE_WEIGHTS.default)
      : CONSUMPTION_SHAPE_WEIGHTS[shape]);
  const safe = (raw ?? CONSUMPTION_SHAPE_WEIGHTS.even).slice(0, 12);
  while (safe.length < 12) safe.push(0);
  const total = safe.reduce((sum, v) => sum + (Number.isFinite(v) && v > 0 ? v : 0), 0);
  if (total <= 0) return Array.from({ length: 12 }, () => 1 / 12);
  const normalised = safe.map((v) => (Number.isFinite(v) && v > 0 ? v : 0) / total);
  const adjusted = applyHemisphere(normalised, latitude);
  const adjustedTotal = adjusted.reduce((sum, v) => sum + v, 0) || 1;
  return adjusted.map((v) => v / adjustedTotal);
}


/**
 * Distributes an annual consumption over 12 months.
 * The returned values always sum exactly to `annualKwh` (full precision kept
 * internally; rounding happens only at presentation time).
 */
export function estimateMonthlyConsumption(
  annualKwh: number,
  shape: ConsumptionShape,
  marketDefaultWeights?: number[] | null,
  latitude?: number | null,
): number[] {
  const annual = Number.isFinite(annualKwh) && annualKwh > 0 ? annualKwh : 0;
  const weights = getShapeWeights(shape, marketDefaultWeights, latitude);
  const months = weights.map((w) => annual * w);
  const drift = annual - months.reduce((sum, v) => sum + v, 0);
  months[11] = (months[11] ?? 0) + drift;
  return months;
}

