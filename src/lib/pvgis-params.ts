/**
 * Pure PVGIS request-parameter construction.
 *
 * Kept free of any network or framework code so the parameter logic can be
 * verified deterministically in tests.
 *
 * Orientation priority (a manually supplied value is never replaced by a
 * generic PVGIS optimisation):
 *   A. tilt + aspect  -> angle=<tilt>&aspect=<aspect>            (no optimisation)
 *   B. aspect only    -> optimalinclination=1&aspect=<aspect>    (tilt optimised)
 *   C. tilt only      -> angle=<tilt>&aspect=<hemisphere default>
 *   D. neither        -> optimalangles=1  (only case where PVGIS picks both)
 *
 * Case D is the only one that has been observed to return HTTP 500 from PVGIS
 * at equatorial coordinates, so it has a documented orientation fallback
 * (`fallbackOrientationParams`). The fallback only replaces the orientation
 * parameters — irradiation always comes from PVGIS for the real coordinate.
 */

import {
  EQUATOR_NEUTRAL_ZONE_DEGREES,
  defaultPvgisAzimuthForLatitude,
} from "@/lib/geo/hemisphere";

export const PVGIS_BASE_URL = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc";

/** Fixed system assumptions — unchanged by this module. */
export const PVGIS_SYSTEM_PARAMS = {
  peakpower: "1",
  loss: "14",
  pvtechchoice: "crystSi",
  mountingplace: "building",
  outputformat: "json",
} as const;

/**
 * Technical tilt fallback when PVGIS cannot optimise the angles itself:
 * the standard rule of thumb "tilt ~= latitude", capped at 35 deg so tropical
 * and high-latitude sites both get a physically sensible roof angle.
 * This is a geometric default, not a market-specific assumption.
 */
export const MAX_FALLBACK_TILT_DEGREES = 35;

export function fallbackTiltForLatitude(latitude: number): number {
  const absolute = Math.abs(Number.isFinite(latitude) ? latitude : 0);
  return Math.round(Math.min(absolute, MAX_FALLBACK_TILT_DEGREES));
}

/**
 * Aspect used when the user gave no direction: the hemisphere default
 * (south on the northern hemisphere, north on the southern one). Inside the
 * equatorial neutral zone there is no meaningful direction, so 0 (south) is
 * used purely as a neutral reference — near the equator the aspect has very
 * little effect on yield.
 */
export function fallbackAspectForLatitude(latitude: number): number {
  return defaultPvgisAzimuthForLatitude(latitude) ?? 0;
}

export type PvgisOrientationMode =
  | "explicit"
  | "optimal-inclination"
  | "explicit-with-default-aspect"
  | "optimal-angles";

export interface PvgisLocationInput {
  latitude: number;
  longitude: number;
  /** PVGIS aspect: 0 = south, -90 = east, 90 = west. Null = not provided. */
  azimuth: number | null;
  /** Tilt in degrees. Null = not provided. */
  tilt: number | null;
}

export interface PvgisRequestPlan {
  mode: PvgisOrientationMode;
  params: URLSearchParams;
  url: string;
  /** True when PVGIS decided the tilt rather than the user. */
  optimalTiltUsed: boolean;
}

function baseParams(input: PvgisLocationInput): URLSearchParams {
  return new URLSearchParams({
    lat: String(input.latitude),
    lon: String(input.longitude),
    ...PVGIS_SYSTEM_PARAMS,
  });
}

function toUrl(params: URLSearchParams): string {
  return `${PVGIS_BASE_URL}?${params.toString()}`;
}

/** Primary request plan for a location. */
export function buildPvgisRequest(input: PvgisLocationInput): PvgisRequestPlan {
  const params = baseParams(input);
  const hasTilt = input.tilt !== null;
  const hasAspect = input.azimuth !== null;

  let mode: PvgisOrientationMode;
  if (hasTilt && hasAspect) {
    // A: everything known — no optimisation parameter at all.
    params.set("angle", String(input.tilt));
    params.set("aspect", String(input.azimuth));
    mode = "explicit";
  } else if (!hasTilt && hasAspect) {
    // B: keep the user's direction, let PVGIS optimise only the inclination.
    params.set("optimalinclination", "1");
    params.set("aspect", String(input.azimuth));
    mode = "optimal-inclination";
  } else if (hasTilt && !hasAspect) {
    // C: keep the user's tilt, derive the aspect from the hemisphere.
    params.set("angle", String(input.tilt));
    params.set("aspect", String(fallbackAspectForLatitude(input.latitude)));
    mode = "explicit-with-default-aspect";
  } else {
    // D: nothing known — the only case where PVGIS may optimise both.
    params.set("optimalangles", "1");
    mode = "optimal-angles";
  }

  return {
    mode,
    params,
    url: toUrl(params),
    optimalTiltUsed: !hasTilt,
  };
}

/**
 * Single controlled retry for case D when `optimalangles=1` returns a 5xx.
 * Replaces only the orientation parameters with documented geographic
 * defaults; the coordinate and every system assumption stay identical.
 */
/**
 * Plausibility gate for the tilt PVGIS reports back in case D
 * (`optimalangles=1`). PVGIS has been observed to answer with a sentinel /
 * flat optimum (e.g. slope -1) outside the equatorial band, which understates
 * the yield of a normal roof. Such an answer is rejected and the documented
 * geographic fallback is used instead — the irradiation still comes from
 * PVGIS for the exact same coordinate.
 *
 * A genuinely flat optimum inside the equatorial neutral zone is plausible and
 * is kept.
 */
export const MIN_PLAUSIBLE_OPTIMAL_TILT_DEGREES = 5;

export function isImplausibleOptimalTilt(
  slope: number | null | undefined,
  latitude: number,
): boolean {
  if (slope === null || slope === undefined || !Number.isFinite(slope)) return true;
  if (slope < 0 || slope > 90) return true;
  // Near the equator a flat array really is close to optimal.
  if (Math.abs(latitude) <= EQUATOR_NEUTRAL_ZONE_DEGREES) return false;
  return slope < MIN_PLAUSIBLE_OPTIMAL_TILT_DEGREES;
}

export function buildPvgisOrientationFallbackRequest(
  input: PvgisLocationInput,
): PvgisRequestPlan {
  const params = baseParams(input);
  const tilt = fallbackTiltForLatitude(input.latitude);
  params.set("angle", String(tilt));
  params.set("aspect", String(fallbackAspectForLatitude(input.latitude)));
  return {
    mode: "explicit-with-default-aspect",
    params,
    url: toUrl(params),
    optimalTiltUsed: true,
  };
}
