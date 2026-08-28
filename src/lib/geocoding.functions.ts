import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface GeocodeSuggestion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode: string;
  region: string;
}

const searchInput = z.object({
  query: z.string().min(3).max(200),
  language: z.string().min(2).max(10).default("sv"),
});

const reverseInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  language: z.string().min(2).max(10).default("sv"),
});

interface NominatimPlace {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

function toSuggestion(place: NominatimPlace): GeocodeSuggestion {
  const address = place.address ?? {};
  return {
    id: String(place.place_id),
    label: place.display_name,
    latitude: Number(place.lat),
    longitude: Number(place.lon),
    countryCode: (address["country_code"] ?? "").toUpperCase(),
    region: address["state"] ?? address["county"] ?? address["region"] ?? "",
  };
}

const USER_AGENT = "Mr. Solar Doc/1.0 (solar sizing app)";

export const searchAddress = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => searchInput.parse(data))
  .handler(async ({ data }): Promise<GeocodeSuggestion[]> => {
    const params = new URLSearchParams({
      q: data.query,
      format: "jsonv2",
      addressdetails: "1",
      limit: "6",
      "accept-language": data.language,
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`GEOCODING_FAILED_${response.status}`);
    const json = (await response.json()) as NominatimPlace[];
    return json.map(toSuggestion);
  });

export const reverseGeocode = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => reverseInput.parse(data))
  .handler(async ({ data }): Promise<GeocodeSuggestion | null> => {
    const params = new URLSearchParams({
      lat: String(data.latitude),
      lon: String(data.longitude),
      format: "jsonv2",
      addressdetails: "1",
      "accept-language": data.language,
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`REVERSE_GEOCODING_FAILED_${response.status}`);
    const json = (await response.json()) as NominatimPlace & { error?: string };
    if (json.error || !json.lat) return null;
    return toSuggestion(json);
  });
