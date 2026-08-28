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

const USER_AGENT = "MrSolarDoc/1.0 (solar sizing app)";

/**
 * Nominatim usage policy: at most one request per second, per application.
 * The queue below is per server isolate, and several isolates may run in
 * parallel, so we keep a safety margin above the documented one second.
 */
const MIN_REQUEST_INTERVAL_MS = 1200;
/** Upstream throttling response: retried once after a short pause. */
const RATE_LIMIT_STATUS = 429;
const RATE_LIMIT_RETRY_DELAY_MS = 1500;
/** Hard ceiling so a slow upstream can never pin the user in a loading state. */
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 1000 * 60 * 10;
const CACHE_MAX_ENTRIES = 300;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const responseCache = new Map<string, CacheEntry>();

/**
 * Serialises every outgoing Nominatim call across all concurrent users of this
 * server instance, spacing them at least one second apart.
 */
let requestChain: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function scheduleNominatimSlot(): Promise<void> {
  const slot = requestChain.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  });
  requestChain = slot.catch(() => undefined);
  return slot;
}

function readCache<T>(key: string): T | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    responseCache.delete(key);
    return undefined;
  }
  // Refresh recency so the map behaves like a small LRU.
  responseCache.delete(key);
  responseCache.set(key, entry);
  return entry.value as T;
}

function writeCache(key: string, value: unknown): void {
  responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  while (responseCache.size > CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
}

/** Collapses whitespace and case so "  Storgatan 1 " and "storgatan 1" share a slot. */
function normaliseQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

async function requestNominatim(url: string): Promise<Response> {
  await scheduleNominatimSlot();
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function fetchNominatim(url: string, errorPrefix: string): Promise<unknown> {
  let response = await requestNominatim(url);
  // Parallel isolates can still trip the shared rate limit: back off once.
  if (response.status === RATE_LIMIT_STATUS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS));
    response = await requestNominatim(url);
  }
  if (!response.ok) throw new Error(`${errorPrefix}_${response.status}`);
  return response.json();
}

export const searchAddress = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => searchInput.parse(data))
  .handler(async ({ data }): Promise<GeocodeSuggestion[]> => {
    const normalised = normaliseQuery(data.query);
    const cacheKey = `search:${data.language}:${normalised}`;
    const cached = readCache<GeocodeSuggestion[]>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      q: normalised,
      format: "jsonv2",
      addressdetails: "1",
      limit: "6",
      "accept-language": data.language,
    });
    const json = (await fetchNominatim(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      "GEOCODING_FAILED",
    )) as NominatimPlace[];
    const suggestions = json.map(toSuggestion);
    writeCache(cacheKey, suggestions);
    return suggestions;
  });

export const reverseGeocode = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => reverseInput.parse(data))
  .handler(async ({ data }): Promise<GeocodeSuggestion | null> => {
    // ~11 m grid: repeated map nudges reuse one upstream call.
    const cacheKey = `reverse:${data.language}:${data.latitude.toFixed(4)}:${data.longitude.toFixed(4)}`;
    const cached = readCache<GeocodeSuggestion | null>(cacheKey);
    if (cached !== undefined) return cached;

    const params = new URLSearchParams({
      lat: String(data.latitude),
      lon: String(data.longitude),
      format: "jsonv2",
      addressdetails: "1",
      "accept-language": data.language,
    });
    const json = (await fetchNominatim(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      "REVERSE_GEOCODING_FAILED",
    )) as NominatimPlace & { error?: string };
    const result = json.error || !json.lat ? null : toSuggestion(json);
    writeCache(cacheKey, result);
    return result;
  });
