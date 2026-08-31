import { fetchPvgis } from "@/lib/pvgis.functions";
import type { Orientation, SolarResource } from "@/lib/calc/types";
import { defaultPvgisAzimuthForLatitude } from "@/lib/geo/hemisphere";

/** PVGIS azimuth convention: 0 = south, negative = east, positive = west. */
const ORIENTATION_AZIMUTH: Record<Exclude<Orientation, "unknown">, number> = {
  south: 0,
  southeast: -45,
  southwest: 45,
  east: -90,
  west: 90,
};

export interface SolarResourceRequest {
  latitude: number;
  longitude: number;
  orientation: Orientation;
  /** Tilt in degrees, or null for "don't know" -> optimal angles. */
  tiltDegrees: number | null;
  /** Exact compass azimuth (0=N, 90=E, 180=S, 270=W); overrides preset orientation when set. */
  azimuthDegrees?: number | null;
}

/** Convert compass azimuth (0=N, clockwise) to PVGIS azimuth (0=S, negative=east). */
function compassToPvgisAzimuth(compass: number): number {
  const pvgis = compass - 180;
  return pvgis < -180 ? pvgis + 360 : pvgis;
}

/**
 * Only this service talks to PVGIS. UI must never call the API directly.
 * Never invents data: failures propagate so the UI can offer a retry.
 */
export async function getSolarResource(
  request: SolarResourceRequest,
): Promise<SolarResource> {
  const orientationAssumed = request.orientation === "unknown";
  const tiltAssumed = request.tiltDegrees === null;

  // Priority: user azimuth > user preset orientation > latitude-based default.
  // Latitude (not country) decides the hemisphere: south on the northern
  // hemisphere, north on the southern one, and no assumption near the equator.
  const azimuth = orientationAssumed
    ? defaultPvgisAzimuthForLatitude(request.latitude)
    : request.azimuthDegrees != null
      ? compassToPvgisAzimuth(request.azimuthDegrees)
      : ORIENTATION_AZIMUTH[request.orientation as Exclude<Orientation, "unknown">];

  const pvgis = await fetchPvgis({
    data: {
      latitude: request.latitude,
      longitude: request.longitude,
      azimuth,
      // Optimal angles are only used when the user has no tilt at all.
      tilt: request.tiltDegrees,
    },
  });

  return {
    annualKwhPerKwp: pvgis.annualKwhPerKwp,
    monthlyKwhPerKwp: pvgis.monthlyKwhPerKwp,
    orientation: request.orientation,
    azimuthDegrees: orientationAssumed ? null : (request.azimuthDegrees ?? null),
    // Always report back exactly what the user chose; PVGIS only fills the gap.
    tiltDegrees: request.tiltDegrees ?? pvgis.tiltDegrees,
    orientationAssumed,
    tiltAssumed,
    dataSource: pvgis.dataSource,
    calculationDate: new Date().toISOString(),
  };
}
