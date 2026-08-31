import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildPvgisOrientationFallbackRequest,
  buildPvgisRequest,
  type PvgisRequestPlan,
} from "@/lib/pvgis-params";
import { encodePvgisError, extractPvgisMessage } from "@/lib/pvgis-error";

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

interface PvgisJson {
  outputs?: {
    monthly?: { fixed?: Array<{ month: number; E_m: number }> };
    totals?: { fixed?: { E_y: number } };
  };
  inputs?: {
    mounting_system?: { fixed?: { slope?: { value?: number } } };
    meteo_data?: { radiation_db?: string };
  };
  /** Legacy location of meteo_data in older PVGIS versions. */
  meta?: { inputs?: { meteo_data?: { radiation_db?: string } } };
}

/**
 * Radiation database label, e.g. "PVGIS-SARAH3" / "PVGIS-ERA5".
 * v5.3 exposes it under `inputs.meteo_data`; the old `meta.inputs` path is
 * kept as a defensive fallback, then a generic version label.
 */
export function readDataSource(json: PvgisJson): string {
  const db =
    json.inputs?.meteo_data?.radiation_db ??
    json.meta?.inputs?.meteo_data?.radiation_db ??
    null;
  if (!db) return "PVGIS v5.3";
  return db.toUpperCase().startsWith("PVGIS") ? db : `PVGIS ${db}`;
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

    const json = (await response.json()) as PvgisJson;

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
