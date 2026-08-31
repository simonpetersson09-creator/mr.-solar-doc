/**
 * Geographical assumptions derived from coordinates — never from the country
 * (several countries span both hemispheres).
 */

export type Hemisphere = "north" | "south" | "equatorial";

/**
 * Latitude band around the equator where neither south nor north is clearly
 * optimal. Inside this band we let the solar resource model (PVGIS) decide
 * instead of asserting a direction.
 */
export const EQUATOR_NEUTRAL_ZONE_DEGREES = 5;

export function getHemisphere(
  latitude: number,
  neutralZoneDegrees = EQUATOR_NEUTRAL_ZONE_DEGREES,
): Hemisphere {
  if (!Number.isFinite(latitude)) return "north";
  if (Math.abs(latitude) <= neutralZoneDegrees) return "equatorial";
  return latitude > 0 ? "north" : "south";
}

/**
 * Default orientation as a compass azimuth (0 = N, 90 = E, 180 = S, 270 = W).
 * Returns null in the equatorial band, meaning "no assumption — let PVGIS
 * optimise the aspect".
 */
export function defaultCompassAzimuthForLatitude(
  latitude: number,
  neutralZoneDegrees = EQUATOR_NEUTRAL_ZONE_DEGREES,
): number | null {
  switch (getHemisphere(latitude, neutralZoneDegrees)) {
    case "north":
      return 180;
    case "south":
      return 0;
    default:
      return null;
  }
}

/**
 * Same default expressed in the PVGIS aspect convention already used by the
 * app: 0 = south, negative = east, positive = west, 180 = north.
 * Null means "let PVGIS pick the optimal aspect".
 */
export function defaultPvgisAzimuthForLatitude(
  latitude: number,
  neutralZoneDegrees = EQUATOR_NEUTRAL_ZONE_DEGREES,
): number | null {
  switch (getHemisphere(latitude, neutralZoneDegrees)) {
    case "north":
      return 0;
    case "south":
      return 180;
    default:
      return null;
  }
}
