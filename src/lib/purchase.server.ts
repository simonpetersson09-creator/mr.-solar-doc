/**
 * Server-only implementations behind the paywall server functions and the
 * stable native REST route (`/api/public/purchase`).
 *
 * Kept out of `purchase.functions.ts` so both transports share exactly the
 * same logic: the web app calls it through TanStack server functions, the
 * native app through a REST route whose URL never changes between builds.
 */

import {
  PREMIUM_PRODUCT_ID,
  REVISION_LIMIT,
  REVISION_WINDOW_HOURS,
  UNLOCK_PRODUCT_ID,
} from "@/config/purchase";
import type { PurchaseReceipt, PurchaseStatus } from "@/lib/calculation-snapshot";

export interface PremiumStatus {
  active: boolean;
  expiresAt: string | null;
  autoRenew: boolean;
  /** True when Apple could not be reached, so the answer is the stored one. */
  stale: boolean;
}

interface AccessInput {
  id: string;
  accessToken: string;
}

/** Creates the pending receipt row that the paywall is shown for. */
export async function createPendingCalculationProvider(data: { deviceId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("calculations")
    .insert({
      device_id: data.deviceId,
      status: "pending",
      product_id: UNLOCK_PRODUCT_ID,
      // The real price and currency come from the verified App Store
      // transaction; never store a hardcoded local amount.
      price_amount: null,
      price_currency: null,
    } as never)
    .select("id, access_token")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Could not start purchase");
  return { id: row.id as string, accessToken: row.access_token as string };
}

/**
 * How many recalculations a paid one-off calculation still has, and when the
 * window closes. Never trusts the client: both the counter and the clock live
 * on the server.
 */
function revisionState(row: {
  status?: string | null;
  purchased_at?: string | null;
  created_at?: string | null;
  revisions_used?: number | null;
}): { revisionsLeft: number; revisionsUsed: number; revisionWindowEndsAt: string | null } {
  const used = Math.max(0, Number(row.revisions_used ?? 0));
  const startedAt = row.purchased_at ?? row.created_at ?? null;
  if (row.status !== "paid" || !startedAt) {
    return { revisionsLeft: 0, revisionsUsed: used, revisionWindowEndsAt: null };
  }
  const endsAt = new Date(
    new Date(startedAt).getTime() + REVISION_WINDOW_HOURS * 60 * 60 * 1000,
  );
  const open = endsAt.getTime() > Date.now();
  return {
    revisionsUsed: used,
    revisionsLeft: open ? Math.max(0, REVISION_LIMIT - used) : 0,
    revisionWindowEndsAt: endsAt.toISOString(),
  };
}

/** Current payment status for one calculation. */
export async function getPurchaseStatusProvider(data: AccessInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("calculations")
    .select("status, purchased_at, created_at, revisions_used")
    .eq("id", data.id)
    .eq("access_token", data.accessToken)
    .maybeSingle();
  return {
    status: (row?.status ?? "pending") as PurchaseStatus,
    found: Boolean(row),
    purchasedAt:
      ((row?.purchased_at as string | null) ?? (row?.created_at as string | null)) ?? null,
    ...revisionState(row ?? {}),
  };
}

/**
 * Spends one recalculation on an already paid calculation. The same receipt is
 * reused, so the user is not charged again — up to REVISION_LIMIT times within
 * REVISION_WINDOW_HOURS of the purchase.
 */
export async function claimCalculationRevisionProvider(data: AccessInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("calculations")
    .select("status, purchased_at, created_at, revisions_used")
    .eq("id", data.id)
    .eq("access_token", data.accessToken)
    .maybeSingle();
  if (!row) return { granted: false as const, reason: "not-found", revisionsLeft: 0 };

  const state = revisionState(row);
  if (row.status !== "paid") {
    return { granted: false as const, reason: "not-paid", revisionsLeft: 0 };
  }
  if (state.revisionsLeft <= 0) {
    return {
      granted: false as const,
      reason:
        state.revisionWindowEndsAt && new Date(state.revisionWindowEndsAt) <= new Date()
          ? "window-closed"
          : "limit-reached",
      revisionsLeft: 0,
    };
  }

  const nextUsed = state.revisionsUsed + 1;
  const { error } = await supabaseAdmin
    .from("calculations")
    .update({ revisions_used: nextUsed, last_revision_at: new Date().toISOString() } as never)
    .eq("id", data.id)
    .eq("access_token", data.accessToken)
    .eq("status", "paid")
    .eq("revisions_used", state.revisionsUsed);
  if (error) return { granted: false as const, reason: "retry", revisionsLeft: 0 };

  return {
    granted: true as const,
    revisionsLeft: Math.max(0, REVISION_LIMIT - nextUsed),
    revisionWindowEndsAt: state.revisionWindowEndsAt,
  };
}

/** Records a cancelled or failed purchase attempt without losing the row. */
export async function markPurchaseOutcomeProvider(
  data: AccessInput & { status: "failed" | "cancelled"; reason?: string | undefined },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("calculations")
    .update({ status: data.status, failure_reason: data.reason ?? null })
    .eq("id", data.id)
    .eq("access_token", data.accessToken)
    .neq("status", "paid");
  return { status: data.status as PurchaseStatus };
}

/** Verifies the App Store transaction with Apple and unlocks on success. */
export async function verifyApplePurchaseProvider(
  data: AccessInput & { transactionId: string },
) {
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
    const terminal = code === "wrong-bundle" || code === "wrong-product" || code === "revoked";
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
}

/** Receipts for calculations purchased on this device. No calculation data. */
export async function listPurchasedCalculationsProvider(data: { deviceId: string }) {
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
}

/* ------------------------------------------------------------------ */
/* Premium — auto-renewable yearly subscription                        */
/* ------------------------------------------------------------------ */

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
export async function getPremiumStatusProvider(data: {
  deviceId: string;
}): Promise<PremiumStatus> {
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
}

/**
 * Verifies a StoreKit subscription transaction with Apple and binds it to this
 * device. The same Apple subscription may move between devices (reinstall, new
 * phone, restore) — the row simply follows the latest verified device.
 */
export async function verifyApplePremiumProvider(data: {
  deviceId: string;
  transactionId: string;
}): Promise<
  { status: "active" | "inactive" | "failed" | "pending"; reason?: string } & Partial<PremiumStatus>
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { verifyAppleTransaction, getAppleSubscriptionState, AppleVerificationError } =
    await import("@/lib/apple-iap.server");

  try {
    const verified = await verifyAppleTransaction(data.transactionId, PREMIUM_PRODUCT_ID);
    // The subscription status endpoint can lag behind a just-completed purchase
    // (typical in Sandbox / App Review). The signed transaction itself is proof
    // enough for the first period, so fall back to it instead of telling the
    // buyer the purchase failed.
    const state = await getAppleSubscriptionState(
      verified.originalTransactionId,
      PREMIUM_PRODUCT_ID,
    ).catch((error: unknown) => {
      const code = error instanceof AppleVerificationError ? error.code : "apple-error";
      const notExpired = verified.expiresAt
        ? new Date(verified.expiresAt).getTime() > Date.now()
        : false;
      if ((code === "not-found" || code === "apple-error") && notExpired) {
        return {
          active: true,
          appleStatus: 1,
          productId: verified.productId,
          originalTransactionId: verified.originalTransactionId,
          transactionId: verified.transactionId,
          environment: verified.environment,
          expiresAt: verified.expiresAt,
          autoRenew: true,
          revokedAt: null,
        };
      }
      throw error;
    });



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
}
