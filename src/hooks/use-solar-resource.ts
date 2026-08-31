import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getSolarResource } from "@/services/solar-resource-service";
import type { Orientation, SolarResource } from "@/lib/calc/types";

export interface UseSolarResourceParams {
  latitude?: number | undefined;
  longitude?: number | undefined;
  orientation: Orientation;
  tiltDegrees: number | null;
  azimuthDegrees?: number | null;
  enabled?: boolean | undefined;
}

export function useSolarResource(params: UseSolarResourceParams) {
  const { latitude, longitude, orientation, tiltDegrees, azimuthDegrees = null, enabled = true } = params;

  return useQuery<SolarResource>({
    queryKey: ["solar-resource", latitude, longitude, orientation, tiltDegrees, azimuthDegrees],
    enabled: enabled && latitude !== undefined && longitude !== undefined,
    staleTime: 1000 * 60 * 60,
    retry: 1,
    // Keep the last value while re-fetching so the result card never unmounts.
    placeholderData: keepPreviousData,
    queryFn: () =>
      getSolarResource({
        latitude: latitude as number,
        longitude: longitude as number,
        orientation,
        tiltDegrees,
        azimuthDegrees,
      }),
  });
}
