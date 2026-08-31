/**
 * Server functions for the paywall.
 *
 * Privacy: the server stores a purchase receipt only. No calculation data —
 * no address, coordinates, consumption, fuse size, roof data, economic
 * assumptions or results — is ever sent here or written to the database.
 * The calculation itself stays on the user's device (see calculation-store.ts).
 *
 * The receipt row is still the only source of truth for whether a calculation
 * is unlocked, so the result page cannot be reached without a verified purchase.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { UNLOCK_PRICE_AMOUNT, UNLOCK_PRICE_CURRENCY, UNLOCK_PRODUCT_ID } from "@/config/purchase";
import type { PurchaseReceipt, PurchaseStatus } from "@/lib/calculation-snapshot";

const deviceIdSchema = z.string().min(8).max(128);

const createSchema = z.object({ deviceId: deviceIdSchema });

const accessSchema = z.object({
  id: z.string().uuid(),
  accessToken: z.string().uuid(),
});

const verifySchema = accessSchema.extend({
  transactionId: z.string().min(1).max(200),
});

const statusSchema = accessSchema.extend({
  status: z.enum(["failed", "cancelled"]),
  reason: z.string().max(300).optional(),
});

/** Creates the pending receipt row that the paywall is shown for. */
export const createPendingCalculation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("calculations")
      .insert({
        device_id: data.deviceId,
        status: "pending",
        product_id: UNLOCK_PRODUCT_ID,
        price_amount: UNLOCK_PRICE_AMOUNT,
        price_currency: UNLOCK_PRICE_CURRENCY,
      } as never)
      .select("id, access_token")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not start purchase");
    return { id: row.id as string, accessToken: row.access_token as string };
  });

/** Current payment status for one calculation. */
export const getPurchaseStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => accessSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("calculations")
      .select("status, purchased_at, created_at")
      .eq("id", data.id)
      .eq("access_token", data.accessToken)
      .maybeSingle();
    return {
      status: (row?.status ?? "pending") as PurchaseStatus,
      found: Boolean(row),
      purchasedAt:
        ((row?.purchased_at as string | null) ?? (row?.created_at as string | null)) ?? null,
    };
  });

/** Records a cancelled or failed purchase attempt without losing the row. */
export const markPurchaseOutcome = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("calculations")
      .update({ status: data.status, failure_reason: data.reason ?? null })
      .eq("id", data.id)
      .eq("access_token", data.accessToken)
      .neq("status", "paid");
    return { status: data.status as PurchaseStatus };
  });

/** Verifies the App Store transaction with Apple and unlocks on success. */
export const verifyApplePurchase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyAppleTransaction, AppleVerificationError } = await import(
      "@/lib/apple-iap.server"
    );

    const { data: row } = await supabaseAdmin
      .from("calculations")
      .select("id, status")
      .eq("id", data.id)
      .eq("access_token", data.accessToken)
      .maybeSingle();
    if (!row) throw new Error("Calculation not found");
    if (row.status === "paid") return { status: "paid" as PurchaseStatus };

    try {
      const verified = await verifyAppleTransaction(data.transactionId, UNLOCK_PRODUCT_ID);
      const { error } = await supabaseAdmin
        .from("calculations")
        .update({
          status: "paid",
          failure_reason: null,
          apple_transaction_id: verified.transactionId,
          apple_original_transaction_id: verified.originalTransactionId,
          apple_environment: verified.environment,
          purchased_at: verified.purchasedAt,
        })
        .eq("id", data.id)
        .eq("access_token", data.accessToken);
      if (error) throw new Error(error.message);
      return { status: "paid" as PurchaseStatus };
    } catch (error) {
      const code =
        error instanceof AppleVerificationError ? error.code : "apple-error";
      await supabaseAdmin
        .from("calculations")
        .update({ status: "failed", failure_reason: code })
        .eq("id", data.id)
        .eq("access_token", data.accessToken)
        .neq("status", "paid");
      return { status: "failed" as PurchaseStatus, reason: code };
    }
  });

/** Receipts for calculations purchased on this device. No calculation data. */
export const listPurchasedCalculations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ deviceId: deviceIdSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("calculations")
      .select("id, access_token, created_at, purchased_at")
      .eq("device_id", data.deviceId)
      .eq("status", "paid")
      .order("purchased_at", { ascending: false })
      .limit(100);

    const items: PurchaseReceipt[] = (rows ?? []).map((row) => ({
      id: row.id as string,
      accessToken: row.access_token as string,
      createdAt: row.created_at as string,
      purchasedAt: (row.purchased_at as string | null) ?? null,
    }));
    return { items };
  });
