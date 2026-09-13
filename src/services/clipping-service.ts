import { fetchPvgisClipping } from "@/lib/pvgis-clipping.functions";
import type { ClippingLossModel } from "@/lib/calc/clipping";
import { isNativePlatform } from "@/services/native-service";
import { executeNativeClipping } from "@/services/native-clipping";

export interface ClippingRequest {
  latitude: number;
  longitude: number;
  /** PVGIS convention: 0 = south, negative = east. Null = derived server-side. */
  azimuth: number | null;
  /** Tilt in degrees; null = derived server-side from latitude. */
  tilt: number | null;
  /** DC/AC ratio of the recommended system. */
  dcAcRatio: number;
}

/**
 * Only this service asks for a clipping model. A failure propagates: the
 * calculation then reports that clipping is NOT modelled instead of quietly
 * substituting an assumed loss.
 */
export async function getClippingLoss(
  request: ClippingRequest,
): Promise<ClippingLossModel> {
  return isNativePlatform()
    ? executeNativeClipping(request)
    : fetchPvgisClipping({ data: request });
}
