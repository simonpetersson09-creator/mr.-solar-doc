import { reverseGeocode, searchAddress, type GeocodeSuggestion } from "@/lib/geocoding.functions";
import { NATIVE_BACKEND_URL } from "@/config/native-backend";
import { isNativePlatform } from "@/services/native-service";

export type { GeocodeSuggestion };

async function fetchNativeGeocoding(
  params: URLSearchParams,
): Promise<GeocodeSuggestion[] | GeocodeSuggestion | null> {
  const response = await fetch(`${NATIVE_BACKEND_URL}/api/public/geocode?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`NATIVE_GEOCODING_FAILED_${response.status}`);
  return response.json() as Promise<GeocodeSuggestion[] | GeocodeSuggestion | null>;
}

export async function searchAddresses(
  query: string,
  language: string,
): Promise<GeocodeSuggestion[]> {
  if (query.trim().length < 3) return [];
  if (isNativePlatform()) {
    const result = await fetchNativeGeocoding(
      new URLSearchParams({ mode: "search", query: query.trim(), language }),
    );
    return Array.isArray(result) ? result : [];
  }
  return searchAddress({ data: { query: query.trim(), language } });
}

export async function resolvePosition(
  latitude: number,
  longitude: number,
  language: string,
): Promise<GeocodeSuggestion | null> {
  if (isNativePlatform()) {
    const result = await fetchNativeGeocoding(
      new URLSearchParams({
        mode: "reverse",
        latitude: String(latitude),
        longitude: String(longitude),
        language,
      }),
    );
    return Array.isArray(result) ? null : result;
  }
  return reverseGeocode({ data: { latitude, longitude, language } });
}
