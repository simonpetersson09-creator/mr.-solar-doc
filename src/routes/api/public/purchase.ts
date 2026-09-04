import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isNativeAppOrigin } from "@/config/native-backend";
import {
  accessSchema,
  createSchema,
  premiumSchema,
  premiumUnlockSchema,
  premiumVerifySchema,
  statusSchema,
  verifySchema,
} from "@/lib/purchase.functions";

const PURCHASE_API_VERSION = "2026-09-02.1";

/**
 * Stable REST transport for the paywall, used by the native app only.
 *
 * Same exposure as the corresponding server functions (they are unauthenticated
 * too); the access token / device id in the body is the capability. No
 * calculation data is accepted or returned here.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("health") }),
  z.object({ action: z.literal("createPendingCalculation"), payload: createSchema }),
  z.object({ action: z.literal("getPurchaseStatus"), payload: accessSchema }),
  z.object({ action: z.literal("claimCalculationRevision"), payload: accessSchema }),
  z.object({ action: z.literal("markPurchaseOutcome"), payload: statusSchema }),
  z.object({ action: z.literal("verifyApplePurchase"), payload: verifySchema }),
  z.object({ action: z.literal("listPurchasedCalculations"), payload: createSchema }),
  z.object({ action: z.literal("getPremiumStatus"), payload: premiumSchema }),
  z.object({ action: z.literal("verifyApplePremium"), payload: premiumVerifySchema }),
  z.object({ action: z.literal("unlockWithPremium"), payload: premiumUnlockSchema }),
]);

function responseHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "accept,content-type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

// WKWebView pages loaded from capacitor:// have an opaque web origin and can
// therefore send the literal Origin header "null".
function isAllowedOrigin(origin: string | null): origin is string {
  return origin === "null" || isNativeAppOrigin(origin);
}

export const Route = createFileRoute("/api/public/purchase")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("Origin");
        if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: responseHeaders(origin) });
      },
      POST: async ({ request }) => {
        const origin = request.headers.get("Origin");
        if (!isAllowedOrigin(origin)) {
          return Response.json({ error: "forbidden" }, { status: 403 });
        }

        const raw: unknown = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json(
            { error: "invalid_request" },
            { status: 400, headers: responseHeaders(origin) },
          );
        }

        if (parsed.data.action === "health") {
          return Response.json(
            { ok: true, service: "native-purchase", version: PURCHASE_API_VERSION },
            { headers: responseHeaders(origin) },
          );
        }

        try {
          const providers = await import("@/lib/purchase.server");
          const body = parsed.data;
          let result: unknown;
          switch (body.action) {
            case "createPendingCalculation":
              result = await providers.createPendingCalculationProvider(body.payload);
              break;
            case "getPurchaseStatus":
              result = await providers.getPurchaseStatusProvider(body.payload);
              break;
            case "claimCalculationRevision":
              result = await providers.claimCalculationRevisionProvider(body.payload);
              break;
            case "markPurchaseOutcome":
              result = await providers.markPurchaseOutcomeProvider(body.payload);
              break;
            case "verifyApplePurchase":
              result = await providers.verifyApplePurchaseProvider(body.payload);
              break;
            case "listPurchasedCalculations":
              result = await providers.listPurchasedCalculationsProvider(body.payload);
              break;
            case "getPremiumStatus":
              result = await providers.getPremiumStatusProvider(body.payload);
              break;
            case "verifyApplePremium":
              result = await providers.verifyApplePremiumProvider(body.payload);
              break;
            case "unlockWithPremium":
              result = await providers.unlockWithPremiumProvider(body.payload);
              break;
          }
          return Response.json(result, { headers: responseHeaders(origin) });
        } catch (error) {
          console.error("Native purchase call failed", parsed.data.action, error);
          return Response.json(
            { error: "purchase_failed" },
            { status: 502, headers: responseHeaders(origin) },
          );
        }
      },
    },
  },
});
