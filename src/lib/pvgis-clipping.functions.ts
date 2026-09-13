import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  computeClippingLoss,
  type ClippingLossModel,
  type HourlyPowerSample,
} from "@/lib/calc/clipping";
import { encodePvgisError, extractPvgisMessage } from "@/lib/pvgis-error";
import {
  PVGIS_SYSTEM_PARAMS,
  fallbackAspectForLatitude,
  fallbackTiltForLatitude,
} from "@/lib/pvgis-params";

export const PVGIS_SERIES_BASE_URL = "https://re.jrc.ec.europa.eu/api/v5_3/seriescalc";

/**
 * Calendar year of hourly data used for the clipping model. A single, fixed
 * year keeps the result reproducible; the clipping SHARE is far less sensitive
 * to the year than the absolute yield is.
 */
export const CLIPPING_REFERENCE_YEAR = 2020;

const PVGIS_SERIES_TIMEOUT_MS = 20_000;

export const clippingInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** PVGIS convention: 0 = south, negative = east. Null = derive from latitude. */
  azimuth: z.number().min(-180).max(180).nullable(),
  /** Tilt in degrees; null = derive from latitude. */
  tilt: z.number().min(0).max(90).nullable(),
  /** DC/AC ratio of the recommended system. */
  dcAcRatio: z.number().min(0.1).max(3),
});

export type ClippingInput = z.infer<typeof clippingInput>;

interface SeriesJson {
  outputs?: { hourly?: Array<{ time?: string; P?: number }> };
  inputs?: { meteo_data?: { radiation_db?: string } };
}

/** Hourly series cache keyed on location + orientation (ratio is applied after). */
const seriesCache = new Map<string, { hourly: HourlyPowerSample[]; dataSource: string }>();
const SERIES_CACHE_LIMIT = 24;

function seriesUrl(data: ClippingInput): string {
  const params = new URLSearchParams({
    lat: String(data.latitude),
    lon: String(data.longitude),
    ...PVGIS_SYSTEM_PARAMS,
    pvcalculation: "1",
    startyear: String(CLIPPING_REFERENCE_YEAR),
    endyear: String(CLIPPING_REFERENCE_YEAR),
    angle: String(data.tilt ?? fallbackTiltForLatitude(data.latitude)),
    aspect: String(data.azimuth ?? fallbackAspectForLatitude(data.latitude)),
  });
  return `${PVGIS_SERIES_BASE_URL}?${params.toString()}`;
}

function cacheKey(data: ClippingInput): string {
  return [
    data.latitude.toFixed(3),
    data.longitude.toFixed(3),
    data.tilt ?? "auto",
    data.azimuth ?? "auto",
  ].join("|");
}

/** Shared provider: used by the server fn (web) and the stable native route. */
export async function hourlySeriesProvider(data: ClippingInput) {
  const key = cacheKey(data);
  let series = seriesCache.get(key);

  if (!series) {
    const response = await fetch(seriesUrl(data), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PVGIS_SERIES_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(encodePvgisError(response.status, extractPvgisMessage(body)));
    }
    const json = (await response.json()) as SeriesJson;
    const rows = json.outputs?.hourly ?? [];
    const hourly: HourlyPowerSample[] = [];
    for (const row of rows) {
      if (typeof row?.time !== "string" || typeof row?.P !== "number") continue;
      hourly.push({ time: row.time, powerW: row.P });
    }
    // A partial year cannot carry a credible monthly clipping shape.
    if (hourly.length < 8000) throw new Error(encodePvgisError(200, "incomplete hourly series"));
    series = {
      hourly,
      dataSource: json.inputs?.meteo_data?.radiation_db ?? "PVGIS hourly",
    };
    if (seriesCache.size >= SERIES_CACHE_LIMIT) {
      const oldest = seriesCache.keys().next().value;
      if (oldest !== undefined) seriesCache.delete(oldest);
    }
    seriesCache.set(key, series);
  }

  return { ...series, year: CLIPPING_REFERENCE_YEAR };
}

export async function clippingProvider(data: ClippingInput): Promise<ClippingLossModel> {
  const series = await hourlySeriesProvider(data);
  return computeClippingLoss({
    hourly: series.hourly,
    dcAcRatio: data.dcAcRatio,
    dataSource: series.dataSource,
    year: CLIPPING_REFERENCE_YEAR,
  });
}

/** Clipping loss shares for one location, orientation and DC/AC ratio. */
export const fetchPvgisClipping = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => clippingInput.parse(data))
  .handler(async ({ data }): Promise<ClippingLossModel> => clippingProvider(data));

export const fetchPvgisHourly = createServerFn({ method: "GET" })
 .inputValidator((data: unknown) => clippingInput.parse(data))
 .handler(async ({ data }) => hourlySeriesProvider(data));
