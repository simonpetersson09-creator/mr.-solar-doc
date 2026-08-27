import { fetchPvgis } from "@/lib/pvgis.functions";
import type { Orientation, SolarResource } from "@/lib/calc/types";

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

  const azimuth = orientationAssumed
    ? null
    : ORIENTATION_AZIMUTH[request.orientation as Exclude<Orientation, "unknown">];

  const pvgis = await fetchPvgis({
    data: {
      latitude: request.latitude,
      longitude: request.longitude,
      azimuth,
      // Optimal angles are used whenever tilt or orientation is unknown.
      tilt: orientationAssumed ? null : request.tiltDegrees,
    },
  });

  return {
    annualKwhPerKwp: pvgis.annualKwhPerKwp,
    monthlyKwhPerKwp: pvgis.monthlyKwhPerKwp,
    orientation: request.orientation,
    tiltDegrees: pvgis.tiltDegrees,
    orientationAssumed,
    tiltAssumed: tiltAssumed || pvgis.optimalTiltUsed,
    dataSource: pvgis.dataSource,
    calculationDate: new Date().toISOString(),
  };
}
