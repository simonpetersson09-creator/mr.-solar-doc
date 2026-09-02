import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  reverseGeocodingProvider,
  searchGeocodingProvider,
} from "@/lib/geocoding.functions";
import { isNativeAppOrigin } from "@/config/native-backend";

const GEOCODING_API_VERSION = "2026-09-02.1";

const querySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("health"),
  }),
  z.object({
    mode: z.literal("search"),
    query: z.string().min(3).max(200),
    language: z.string().min(2).max(10).default("sv"),
  }),
  z.object({
    mode: z.literal("reverse"),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    language: z.string().min(2).max(10).default("sv"),
  }),
]);

function responseHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "accept,content-type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

// WKWebView pages loaded from capacitor:// have an opaque web origin and can
// therefore send the literal Origin header "null". This exception is kept on
// this read-only endpoint instead of weakening CSRF protection for server fns.
function isAllowedGeocodingOrigin(origin: string | null): origin is string {
  return origin === "null" || isNativeAppOrigin(origin);
}

export const Route = createFileRoute("/api/public/geocode")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("Origin");
        if (!isAllowedGeocodingOrigin(origin)) {
          return new Response(null, { status: 403 });
        }
        return new Response(null, { status: 204, headers: responseHeaders(origin) });
      },
      GET: async ({ request }) => {
        const origin = request.headers.get("Origin");
        if (!isAllowedGeocodingOrigin(origin)) {
          return Response.json(
            { error: "forbidden" },
            { status: 403 },
          );
        }

        const url = new URL(request.url);
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json(
            { error: "invalid_request" },
            { status: 400, headers: responseHeaders(origin) },
          );
        }

        if (parsed.data.mode === "health") {
          return Response.json(
            { ok: true, service: "native-geocoding", version: GEOCODING_API_VERSION },
            { headers: responseHeaders(origin) },
          );
        }

        try {
          const result =
            parsed.data.mode === "search"
              ? await searchGeocodingProvider(parsed.data)
              : await reverseGeocodingProvider(parsed.data);
          return Response.json(result, { headers: responseHeaders(origin) });
        } catch (error) {
          console.error("Native geocoding failed", error);
          return Response.json(
            { error: "geocoding_failed" },
            { status: 502, headers: responseHeaders(origin) },
          );
        }
      },
    },
  },
});