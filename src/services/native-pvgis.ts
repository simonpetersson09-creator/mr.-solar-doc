import { z } from "zod";
import { NATIVE_BACKEND_URL } from "@/config/native-backend";
import type { PvgisResponse } from "@/lib/pvgis.functions";
import { PVGIS_ERROR_PREFIX } from "@/lib/pvgis-error";

export const NATIVE_PVGIS_PATH = "/api/public/pvgis";

const pvgisResponseSchema = z.object({
  annualKwhPerKwp: z.number().finite(),
  monthlyKwhPerKwp: z.array(z.number().finite()).length(12),
  dataSource: z.string(),
  optimalTiltUsed: z.boolean(),
  tiltDegrees: z.number().nullable(),
});

export interface NativePvgisParams {
  latitude: number;
  longitude: number;
  /** PVGIS convention: 0 = south, negative = east. */
  azimuth: number | null;
  tilt: number | null;
}

/**
 * Native-only PVGIS path. Uses a stable REST route instead of server-function
 * RPC ids, which differ between the bundled app and the published backend.
 */
export async function executeNativePvgis(
  params: NativePvgisParams,
): Promise<PvgisResponse> {
  const query = new URLSearchParams({
    mode: "resource",
    latitude: String(params.latitude),
    longitude: String(params.longitude),
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

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail?: unknown }).detail ?? "")
        : "";
    // Preserve the encoded upstream message so the UI can classify the error.
    if (detail.startsWith(PVGIS_ERROR_PREFIX)) throw new Error(detail);
    throw new Error(`${PVGIS_ERROR_PREFIX}|${response.status}|`);
  }

  const parsed = pvgisResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(`${PVGIS_ERROR_PREFIX}|200|`);
  return parsed.data;
}
