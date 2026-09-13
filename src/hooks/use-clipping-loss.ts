import { useQuery } from "@tanstack/react-query";
import { getClippingLoss } from "@/services/clipping-service";
import type { ClippingLossModel } from "@/lib/calc/clipping";

/**
 * DC/AC ratios at or below this cannot clip in practice: the array never
 * reaches the inverter's rated AC power, so no hourly request is made.
 */
export const CLIPPING_MIN_RATIO = 1.0;

/** Ratio rounding for the query key, so tiny changes do not refetch. */
function roundRatio(ratio: number): number {
  return Math.round(ratio * 1000) / 1000;
}

export interface UseClippingLossParams {
  latitude?: number | undefined;
  longitude?: number | undefined;
  /** PVGIS convention: 0 = south, negative = east. */
  azimuth: number | null;
  tilt: number | null;
  /** DC/AC ratio of the recommended system, or null while unknown. */
  dcAcRatio: number | null;
  enabled?: boolean;
}

export function useClippingLoss(params: UseClippingLossParams) {
  const { latitude, longitude, azimuth, tilt, dcAcRatio, enabled = true } = params;
  const ratio = dcAcRatio !== null ? roundRatio(dcAcRatio) : null;

  return useQuery<ClippingLossModel>({
    queryKey: ["clipping-loss", latitude, longitude, azimuth, tilt, ratio],
    enabled:
      enabled &&
      latitude !== undefined &&
      longitude !== undefined &&
      ratio !== null &&
      ratio > CLIPPING_MIN_RATIO,
    staleTime: 1000 * 60 * 60 * 24,
    retry: 1,
    queryFn: () =>
      getClippingLoss({
        latitude: latitude as number,
        longitude: longitude as number,
        azimuth,
        tilt,
        dcAcRatio: ratio as number,
      }),
  });
}
