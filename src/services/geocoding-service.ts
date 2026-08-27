import { reverseGeocode, searchAddress, type GeocodeSuggestion } from "@/lib/geocoding.functions";

export type { GeocodeSuggestion };

export async function searchAddresses(
  query: string,
  language: string,
): Promise<GeocodeSuggestion[]> {
  if (query.trim().length < 3) return [];
  return searchAddress({ data: { query: query.trim(), language } });
}

export async function resolvePosition(
  latitude: number,
  longitude: number,
  language: string,
): Promise<GeocodeSuggestion | null> {
  return reverseGeocode({ data: { latitude, longitude, language } });
}
