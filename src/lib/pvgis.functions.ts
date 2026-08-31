import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const pvgisInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Azimuth in PVGIS convention: 0 = south, -90 = east, 90 = west. */
  azimuth: z.number().nullable(),
  /** Tilt in degrees; null means "use optimal tilt". */
  tilt: z.number().min(0).max(90).nullable(),
});

/** Hard request ceiling for the PVGIS API, in milliseconds. */
const PVGIS_TIMEOUT_MS = 10_000;

export interface PvgisResponse {
  annualKwhPerKwp: number;
  monthlyKwhPerKwp: number[];
  dataSource: string;
  optimalTiltUsed: boolean;
  tiltDegrees: number | null;
}

/** PVGIS PVcalc for a 1 kWp reference system. Results scale linearly with kWp. */
export const fetchPvgis = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => pvgisInput.parse(data))
  .handler(async ({ data }): Promise<PvgisResponse> => {
    const params = new URLSearchParams({
      lat: String(data.latitude),
      lon: String(data.longitude),
      peakpower: "1",
      loss: "14",
      pvtechchoice: "crystSi",
      mountingplace: "building",
      outputformat: "json",
substrings: "",
    });
    params.delete("substrings");

    // A null azimuth means "no direction assumption" (equatorial band): let
    // PVGIS optimise the aspect instead of asserting south or north.
    const useOptimalAngles = data.tilt === null || data.azimuth === null;
    const useOptimalTilt = data.tilt === null;
    if (useOptimalAngles) {
      params.set("optimalangles", "1");
    } else {
      params.set("angle", String(data.tilt));
      params.set("aspect", String(data.azimuth));
    }

    const url = `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?${params.toString()}`;
    // Hard ceiling so a stalled upstream can never pin the user in loading.
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PVGIS_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`PVGIS_REQUEST_FAILED_${response.status}`);
    }

    const json = (await response.json()) as {
      outputs?: {
        monthly?: { fixed?: Array<{ month: number; E_m: number }> };
        totals?: { fixed?: { E_y: number } };
      };
      inputs?: {
        mounting_system?: { fixed?: { slope?: { value?: number } } };
      };
      meta?: { inputs?: { meteo_data?: { radiation_db?: string } } };
    };

    const monthly = json.outputs?.monthly?.fixed;
    const annual = json.outputs?.totals?.fixed?.E_y;
    if (!monthly || monthly.length !== 12 || typeof annual !== "number") {
      throw new Error("PVGIS_INVALID_RESPONSE");
    }

    const monthlyKwhPerKwp = [...monthly]
      .sort((a, b) => a.month - b.month)
      .map((entry) => entry.E_m);

    return {
      annualKwhPerKwp: annual,
      monthlyKwhPerKwp,
      dataSource: `PVGIS ${json.meta?.inputs?.meteo_data?.radiation_db ?? "v5.3"}`,
      optimalTiltUsed: useOptimalTilt,
      tiltDegrees:
        json.inputs?.mounting_system?.fixed?.slope?.value ?? (data.tilt ?? null),
    };
  });
