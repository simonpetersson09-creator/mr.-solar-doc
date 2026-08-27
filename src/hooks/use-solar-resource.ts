import { useQuery } from "@tanstack/react-query";
import { getSolarResource } from "@/services/solar-resource-service";
import type { Orientation, SolarResource } from "@/lib/calc/types";

export interface UseSolarResourceParams {
  latitude?: number;
  longitude?: number;
  orientation: Orientation;
  tiltDegrees: number | null;
  enabled?: boolean;
}

export function useSolarResource(params: UseSolarResourceParams) {
  const { latitude, longitude, orientation, tiltDegrees, enabled = true } = params;

  return useQuery<SolarResource>({
    queryKey: ["solar-resource", latitude, longitude, orientation, tiltDegrees],
    enabled: enabled && latitude !== undefined && longitude !== undefined,
    staleTime: 1000 * 60 * 60,
    retry: 1,
    queryFn: () =>
      getSolarResource({
        latitude: latitude as number,
        longitude: longitude as number,
        orientation,
        tiltDegrees,
      }),
  });
}
