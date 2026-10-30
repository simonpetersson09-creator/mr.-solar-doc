import { createFileRoute } from "@tanstack/react-router";
import { eventSchema } from "@/lib/stat-event-schema";

import { isNativeAppOrigin } from "@/config/native-backend";

/**
 * Anonymous usage statistics (app opens, wizard steps reached, calculations).
 * Write-only: nothing is ever returned. No address, coordinates or bill data.
 */
function headers(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function allowed(origin: string | null, request: Request): boolean {
  if (!origin || origin === "null" || isNativeAppOrigin(origin)) return true;
  return origin === new URL(request.url).origin;
}

export const Route = createFileRoute("/api/public/events")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("Origin");
        if (!allowed(origin, request)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: headers(origin) });
      },
      POST: async ({ request }) => {
        const origin = request.headers.get("Origin");
        if (!allowed(origin, request)) return new Response(null, { status: 403 });
        const parsed = eventSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(null, { status: 400, headers: headers(origin) });
        const e = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("app_events").insert({
          device_id: e.deviceId,
          event: e.event,
          step: e.step ?? null,
          country: e.country ?? null,
          platform: e.platform,
          language: e.language ?? null,
        });
        if (error) console.error("app_events insert failed", error);
        return new Response(null, { status: 204, headers: headers(origin) });
      },
    },
  },
});
