import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { pvgisProvider } from "@/lib/pvgis.functions";
import { isNativeAppOrigin } from "@/config/native-backend";

const PVGIS_API_VERSION = "2026-09-02.1";

const querySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("health") }),
  z.object({
    mode: z.literal("resource"),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    /** PVGIS convention: 0 = south, negative = east. Empty means "not set". */
    azimuth: z.coerce.number().min(-180).max(180).optional(),
    tilt: z.coerce.number().min(0).max(90).optional(),
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
// therefore send the literal Origin header "null". Kept to this read-only route.
function isAllowedOrigin(origin: string | null): origin is string {
  return origin === "null" || isNativeAppOrigin(origin);
}

export const Route = createFileRoute("/api/public/pvgis")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("Origin");
        if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: responseHeaders(origin) });
      },
      GET: async ({ request }) => {
        const origin = request.headers.get("Origin");
        if (!isAllowedOrigin(origin)) {
          return Response.json({ error: "forbidden" }, { status: 403 });
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
            { ok: true, service: "native-pvgis", version: PVGIS_API_VERSION },
            { headers: responseHeaders(origin) },
          );
        }

        try {
          const result = await pvgisProvider({
            latitude: parsed.data.latitude,
            longitude: parsed.data.longitude,
            azimuth: parsed.data.azimuth ?? null,
            tilt: parsed.data.tilt ?? null,
          });
          return Response.json(result, { headers: responseHeaders(origin) });
        } catch (error) {
          console.error("Native PVGIS failed", error);
          const message = error instanceof Error ? error.message : "";
          return Response.json(
            { error: "pvgis_failed", detail: message.slice(0, 200) },
            { status: 502, headers: responseHeaders(origin) },
          );
        }
      },
    },
  },
});
