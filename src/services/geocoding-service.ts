import { reverseGeocode, searchAddress, type GeocodeSuggestion } from "@/lib/geocoding.functions";
import { isNativePlatform } from "@/services/native-service";
import { executeNativeGeocoding } from "@/services/native-geocoding";

export type { GeocodeSuggestion };

export async function searchAddresses(
  query: string,
  language: string,
): Promise<GeocodeSuggestion[]> {
  if (query.trim().length < 3) return [];
  if (isNativePlatform()) {
    const result = await executeNativeGeocoding({
      mode: "search",
      query: query.trim(),
      language,
    });
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
    const result = await executeNativeGeocoding({
      mode: "reverse",
      latitude,
      longitude,
      language,
    });
    return Array.isArray(result) ? null : result;
  }
  return reverseGeocode({ data: { latitude, longitude, language } });
}
