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
import {
  PREMIUM_PRODUCT_ID,
  UNLOCK_PRICE_AMOUNT,
  UNLOCK_PRICE_CURRENCY,
  UNLOCK_PRODUCT_ID,
} from "@/config/purchase";
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

      // The same App Store transaction may only unlock one calculation.
      const { data: usedBy } = await supabaseAdmin
        .from("calculations")
        .select("id")
        .eq("apple_transaction_id", verified.transactionId)
        .neq("id", data.id)
        .maybeSingle();
      if (usedBy) {
        await supabaseAdmin
          .from("calculations")
          .update({ status: "failed", failure_reason: "already-used" })
          .eq("id", data.id)
          .eq("access_token", data.accessToken)
          .neq("status", "paid");
        return { status: "failed" as PurchaseStatus, reason: "already-used" };
      }

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
      if (error) {
        // Writing the receipt failed (network/database). The purchase itself is
        // valid, so keep it retryable instead of burning the transaction.
        return { status: "pending" as PurchaseStatus, reason: "retry" };
      }
      return { status: "paid" as PurchaseStatus };
    } catch (error) {
      const code = error instanceof AppleVerificationError ? error.code : "apple-error";
      // Only Apple's definitive answers are terminal. Anything else (network
      // problems, Apple downtime, misconfiguration) stays pending and retryable
      // so a paid user never loses access.
      const terminal =
        code === "wrong-bundle" || code === "wrong-product" || code === "revoked";
      if (!terminal) {
        return { status: "pending" as PurchaseStatus, reason: code };
      }
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

/* ------------------------------------------------------------------ */
/* Premium — auto-renewable yearly subscription                        */
/* ------------------------------------------------------------------ */

export interface PremiumStatus {
  active: boolean;
  expiresAt: string | null;
  autoRenew: boolean;
  /** True when Apple could not be reached, so the answer is the stored one. */
  stale: boolean;
}

const premiumSchema = z.object({ deviceId: deviceIdSchema });
const premiumVerifySchema = premiumSchema.extend({
  transactionId: z.string().min(1).max(200),
});

interface SubscriptionRow {
  device_id: string;
  apple_original_transaction_id: string;
  status: string;
  expires_at: string | null;
  auto_renew: boolean;
  revoked_at: string | null;
}

/**
 * Re-checks one stored subscription against Apple and writes back the result.
 * Apple is the source of truth; the row is only a cache so the app still knows
 * about the subscription when Apple is briefly unreachable.
 */
async function refreshSubscriptionRow(
  row: SubscriptionRow,
  deviceId: string,
): Promise<PremiumStatus> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getAppleSubscriptionState } = await import("@/lib/apple-iap.server");
  try {
    const state = await getAppleSubscriptionState(
      row.apple_original_transaction_id,
      PREMIUM_PRODUCT_ID,
    );
    await supabaseAdmin
      .from("premium_subscriptions")
      .update({
        device_id: deviceId,
        status: state.active ? "active" : String(state.appleStatus),
        expires_at: state.expiresAt,
        auto_renew: state.autoRenew,
        revoked_at: state.revokedAt,
        apple_transaction_id: state.transactionId,
        apple_environment: state.environment,
        last_checked_at: new Date().toISOString(),
      } as never)
      .eq("apple_original_transaction_id", row.apple_original_transaction_id);
    return {
      active: state.active,
      expiresAt: state.expiresAt,
      autoRenew: state.autoRenew,
      stale: false,
    };
  } catch {
    // Apple unreachable: fall back to the cached period so a paying user is
    // not locked out by a network problem, but never past the paid period.
    const stillPaid =
      !row.revoked_at && Boolean(row.expires_at) && new Date(row.expires_at!) > new Date();
    return {
      active: stillPaid,
      expiresAt: row.expires_at,
      autoRenew: row.auto_renew,
      stale: true,
    };
  }
}

/** Live Premium entitlement for this device. Never trusts the client. */
export const getPremiumStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => premiumSchema.parse(input))
  .handler(async ({ data }): Promise<PremiumStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("premium_subscriptions")
      .select("device_id, apple_original_transaction_id, status, expires_at, auto_renew, revoked_at")
      .eq("device_id", data.deviceId)
      .order("expires_at", { ascending: false })
      .limit(5);

    let best: PremiumStatus = { active: false, expiresAt: null, autoRenew: false, stale: false };
    for (const row of (rows ?? []) as unknown as SubscriptionRow[]) {
      const status = await refreshSubscriptionRow(row, data.deviceId);
      if (status.active && !best.active) best = status;
      else if (!best.active && !best.expiresAt) best = status;
    }
    return best;
  });

/**
 * Verifies a StoreKit subscription transaction with Apple and binds it to this
 * device. The same Apple subscription may move between devices (reinstall, new
 * phone, restore) — the row simply follows the latest verified device.
 */
export const verifyApplePremium = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => premiumVerifySchema.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ status: "active" | "inactive" | "failed" | "pending"; reason?: string } & Partial<PremiumStatus>> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { verifyAppleTransaction, getAppleSubscriptionState, AppleVerificationError } =
        await import("@/lib/apple-iap.server");

      try {
        const verified = await verifyAppleTransaction(data.transactionId, PREMIUM_PRODUCT_ID);
        const state = await getAppleSubscriptionState(
          verified.originalTransactionId,
          PREMIUM_PRODUCT_ID,
        );

        const { error } = await supabaseAdmin.from("premium_subscriptions").upsert(
          {
            device_id: data.deviceId,
            product_id: PREMIUM_PRODUCT_ID,
            apple_original_transaction_id: verified.originalTransactionId,
            apple_transaction_id: state.transactionId ?? verified.transactionId,
            apple_environment: state.environment,
            status: state.active ? "active" : String(state.appleStatus),
            expires_at: state.expiresAt,
            auto_renew: state.autoRenew,
            revoked_at: state.revokedAt,
            last_checked_at: new Date().toISOString(),
          } as never,
          { onConflict: "apple_original_transaction_id" },
        );
        if (error) return { status: "pending", reason: "retry" };

        return {
          status: state.active ? "active" : "inactive",
          active: state.active,
          expiresAt: state.expiresAt,
          autoRenew: state.autoRenew,
          stale: false,
        };
      } catch (error) {
        const code = error instanceof AppleVerificationError ? error.code : "apple-error";
        const terminal = code === "wrong-bundle" || code === "wrong-product" || code === "revoked";
        return { status: terminal ? "failed" : "pending", reason: code };
      }
    },
  );
