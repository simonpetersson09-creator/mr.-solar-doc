import { z } from "zod";
import { NATIVE_BACKEND_URL } from "@/config/native-backend";
import { PVGIS_ERROR_PREFIX } from "@/lib/pvgis-error";
import type { ClippingLossModel } from "@/lib/calc/clipping";
import { NATIVE_PVGIS_PATH } from "@/services/native-pvgis";

const clippingResponseSchema = z.object({
  dcAcRatio: z.number().finite(),
  monthlyLossShare: z.array(z.number().finite()).length(12),
  annualLossShare: z.number().finite(),
  dataSource: z.string(),
  year: z.number().finite(),
});

export interface NativeClippingParams {
  latitude: number;
  longitude: number;
  /** PVGIS convention: 0 = south, negative = east. */
  azimuth: number | null;
  tilt: number | null;
  dcAcRatio: number;
}

/** Native-only clipping path: stable REST route instead of RPC ids. */
export async function executeNativeClipping(
  params: NativeClippingParams,
): Promise<ClippingLossModel> {
  const query = new URLSearchParams({
    mode: "clipping",
    latitude: String(params.latitude),
    longitude: String(params.longitude),
    dcAcRatio: String(params.dcAcRatio),
  });
  if (params.azimuth != null) query.set("azimuth", String(params.azimuth));
  if (params.tilt != null) query.set("tilt", String(params.tilt));

  let response: Response;
  try {
    response = await fetch(`${NATIVE_BACKEND_URL}${NATIVE_PVGIS_PATH}?${query.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new Error(`${PVGIS_ERROR_PREFIX}|0|network`, { cause: error });
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${PVGIS_ERROR_PREFIX}|${response.status}|`);

  const parsed = clippingResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(`${PVGIS_ERROR_PREFIX}|200|`);
  return parsed.data;
}
