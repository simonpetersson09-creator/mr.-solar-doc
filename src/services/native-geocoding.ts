import { z } from "zod";

import { NATIVE_BACKEND_URL } from "@/config/native-backend";
import type { GeocodeSuggestion } from "@/lib/geocoding.functions";

export const NATIVE_GEOCODING_PATH = "/api/public/geocode";

const suggestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  countryCode: z.string(),
  region: z.string(),
});

const responseSchema = z.union([
  z.array(suggestionSchema),
  suggestionSchema,
  z.null(),
]);

export type NativeGeocodingParams =
  | { mode: "search"; query: string; language: string }
  | { mode: "reverse"; latitude: number; longitude: number; language: string };

export interface NativeGeocodingRequest {
  url: string;
  init: RequestInit;
}

export class NativeGeocodingError extends Error {
  readonly endpoint = NATIVE_GEOCODING_PATH;
  readonly status: number | "NETWORK" | "INVALID_RESPONSE";
  readonly backendCode?: string;

  constructor(
    status: number | "NETWORK" | "INVALID_RESPONSE",
    backendCode?: string,
    options?: ErrorOptions,
  ) {
    super(`NATIVE_GEOCODING_FAILED_${status}`, options);
    this.name = "NativeGeocodingError";
    this.status = status;
    this.backendCode = backendCode;
  }
}

export function createNativeGeocodingRequest(
  params: NativeGeocodingParams,
): NativeGeocodingRequest {
  const query = new URLSearchParams({ mode: params.mode, language: params.language });
  if (params.mode === "search") {
    query.set("query", params.query);
  } else {
    query.set("latitude", String(params.latitude));
    query.set("longitude", String(params.longitude));
  }

  return {
    url: `${NATIVE_BACKEND_URL}${NATIVE_GEOCODING_PATH}?${query.toString()}`,
    init: {
      method: "GET",
      headers: { Accept: "application/json" },
    },
  };
}

function safeBackendCode(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("error" in value)) return undefined;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && /^[a-z0-9_-]{1,64}$/i.test(error) ? error : undefined;
}

export async function executeNativeGeocoding(
  params: NativeGeocodingParams,
): Promise<GeocodeSuggestion[] | GeocodeSuggestion | null> {
  const request = createNativeGeocodingRequest(params);
  let response: Response;
  try {
    response = await fetch(request.url, request.init);
  } catch (error) {
    throw new NativeGeocodingError("NETWORK", undefined, { cause: error });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new NativeGeocodingError(
      response.ok ? "INVALID_RESPONSE" : response.status,
      undefined,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new NativeGeocodingError(response.status, safeBackendCode(payload));
  }

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new NativeGeocodingError("INVALID_RESPONSE");
  }
  return parsed.data;
}

/** Temporary TestFlight-safe diagnostic: never includes the entered address. */
export function nativeGeocodingDiagnostic(error: unknown): string | null {
  if (!(error instanceof NativeGeocodingError)) return null;
  const code = error.backendCode ? ` · ${error.backendCode}` : "";
  return `${error.endpoint} · ${error.status}${code}`;
}