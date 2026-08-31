import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildPvgisOrientationFallbackRequest,
  buildPvgisRequest,
  isImplausibleOptimalTilt,
  type PvgisRequestPlan,
} from "@/lib/pvgis-params";
import { encodePvgisError, extractPvgisMessage } from "@/lib/pvgis-error";
import { readDataSource, type PvgisJson } from "@/lib/pvgis-response";

const pvgisInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Azimuth in PVGIS convention: 0 = south, -90 = east, 90 = west. */
  azimuth: z.number().nullable(),
  /** Tilt in degrees; null means "not provided". */
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

async function requestPvgis(plan: PvgisRequestPlan): Promise<Response> {
  return fetch(plan.url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(PVGIS_TIMEOUT_MS),
  });
}

/** PVGIS PVcalc for a 1 kWp reference system. Results scale linearly with kWp. */
export const fetchPvgis = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => pvgisInput.parse(data))
  .handler(async ({ data }): Promise<PvgisResponse> => {
    let plan = buildPvgisRequest(data);
    let response = await requestPvgis(plan);

    // `optimalangles=1` is known to return 5xx at some equatorial coordinates.
    // One controlled retry replaces ONLY the orientation parameters; the
    // irradiation still comes from PVGIS for the exact same coordinate.
    if (!response.ok && response.status >= 500 && plan.mode === "optimal-angles") {
      plan = buildPvgisOrientationFallbackRequest(data);
      response = await requestPvgis(plan);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(encodePvgisError(response.status, extractPvgisMessage(body)));
    }

    let json = (await response.json()) as PvgisJson;

    // Case D again: PVGIS sometimes returns an implausible "optimal" tilt
    // (flat / sentinel slope), which is systematically low for a real roof —
    // observed on the southern hemisphere. One controlled retry replaces only
    // the orientation parameters with the documented geographic defaults.
    if (
      plan.mode === "optimal-angles" &&
      isImplausibleOptimalTilt(
        json.inputs?.mounting_system?.fixed?.slope?.value ?? null,
        data.latitude,
      )
    ) {
      const fallbackPlan = buildPvgisOrientationFallbackRequest(data);
      const fallbackResponse = await requestPvgis(fallbackPlan);
      if (fallbackResponse.ok) {
        const fallbackJson = (await fallbackResponse.json()) as PvgisJson;
        if (fallbackJson.outputs?.monthly?.fixed?.length === 12) {
          plan = fallbackPlan;
          json = fallbackJson;
        }
      }
    }

    const monthly = json.outputs?.monthly?.fixed;
    const annual = json.outputs?.totals?.fixed?.E_y;
    if (!monthly || monthly.length !== 12 || typeof annual !== "number") {
      throw new Error(encodePvgisError(200, null));
    }

    const monthlyKwhPerKwp = [...monthly]
      .sort((a, b) => a.month - b.month)
      .map((entry) => entry.E_m);

    return {
      annualKwhPerKwp: annual,
      monthlyKwhPerKwp,
      dataSource: readDataSource(json),
      optimalTiltUsed: plan.optimalTiltUsed,
      tiltDegrees:
        json.inputs?.mounting_system?.fixed?.slope?.value ?? (data.tilt ?? null),
    };
  });
