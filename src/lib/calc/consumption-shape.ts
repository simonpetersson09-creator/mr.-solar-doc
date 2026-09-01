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
  const raw =
    shape === "default"
      ? (marketDefaultWeights ?? CONSUMPTION_SHAPE_WEIGHTS.default)
      : CONSUMPTION_SHAPE_WEIGHTS[shape];
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

