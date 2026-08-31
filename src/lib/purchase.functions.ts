/**
 * Server functions for the paywall.
 *
 * The database row is the only source of truth for whether a calculation is
 * unlocked. A snapshot is returned only when the row's status is "paid", so the
 * result page cannot be reached by direct navigation, refresh or back button.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { UNLOCK_PRICE_AMOUNT, UNLOCK_PRICE_CURRENCY, UNLOCK_PRODUCT_ID } from "@/config/purchase";
import type { CalculationSnapshot, CalculationSummary, PurchaseStatus } from "@/lib/calculation-snapshot";

const deviceIdSchema = z.string().min(8).max(128);

const createSchema = z.object({
  deviceId: deviceIdSchema,
  snapshot: z.record(z.string(), z.unknown()),
  summary: z.object({
    address: z.string(),
    countryCode: z.string(),
    currency: z.string(),
    installedKwp: z.number(),
    annualProductionKwh: z.number(),
    paybackYears: z.number(),
  }),
});

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

/** Creates the pending row that the paywall is shown for. */
export const createPendingCalculation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("calculations")
      .insert({
        device_id: data.deviceId,
        status: "pending",
        snapshot: data.snapshot,
        address: data.summary.address,
        country_code: data.summary.countryCode,
        currency: data.summary.currency,
        installed_kwp: data.summary.installedKwp,
        annual_production_kwh: data.summary.annualProductionKwh,
        payback_years: Math.round(data.summary.paybackYears),
        product_id: UNLOCK_PRODUCT_ID,
        price_amount: UNLOCK_PRICE_AMOUNT,
        price_currency: UNLOCK_PRICE_CURRENCY,
      })
      .select("id, access_token")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not store calculation");
    return { id: row.id as string, accessToken: row.access_token as string };
  });

/** Current payment status for one calculation. */
export const getPurchaseStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => accessSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("calculations")
      .select("status")
      .eq("id", data.id)
      .eq("access_token", data.accessToken)
      .maybeSingle();
    return { status: (row?.status ?? "pending") as PurchaseStatus, found: Boolean(row) };
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

/** Returns the purchased snapshot. Locked calculations return nothing. */
export const getPaidCalculation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => accessSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("calculations")
      .select("id, status, snapshot, purchased_at, created_at")
      .eq("id", data.id)
      .eq("access_token", data.accessToken)
      .maybeSingle();
    if (!row || row.status !== "paid") {
      return { unlocked: false as const, snapshot: null };
    }
    return {
      unlocked: true as const,
      snapshot: row.snapshot as unknown as CalculationSnapshot,
      purchasedAt: (row.purchased_at as string | null) ?? (row.created_at as string),
    };
  });

/** History: only purchased calculations for this device. */
export const listPurchasedCalculations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ deviceId: deviceIdSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("calculations")
      .select(
        "id, access_token, created_at, purchased_at, address, country_code, installed_kwp, annual_production_kwh, payback_years",
      )
      .eq("device_id", data.deviceId)
      .eq("status", "paid")
      .order("purchased_at", { ascending: false })
      .limit(100);

    const items: CalculationSummary[] = (rows ?? []).map((row) => ({
      id: row.id as string,
      accessToken: row.access_token as string,
      createdAt: row.created_at as string,
      purchasedAt: (row.purchased_at as string | null) ?? null,
      address: (row.address as string | null) ?? "",
      countryCode: (row.country_code as string | null) ?? "",
      installedKwp: Number(row.installed_kwp ?? 0),
      annualProductionKwh: Number(row.annual_production_kwh ?? 0),
      paybackYears: Number(row.payback_years ?? 0),
    }));
    return { items };
  });
