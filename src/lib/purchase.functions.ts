/**
 * Server functions for the paywall (web transport).
 *
 * Privacy: the server stores a purchase receipt only. No calculation data —
 * no address, coordinates, consumption, fuse size, roof data, economic
 * assumptions or results — is ever sent here or written to the database.
 * The calculation itself stays on the user's device (see calculation-store.ts).
 *
 * The receipt row is still the only source of truth for whether a calculation
 * is unlocked, so the result page cannot be reached without a verified purchase.
 *
 * The logic lives in `purchase.server.ts`; the native app reaches the same
 * logic through the stable REST route `/api/public/purchase`, because
 * server-function RPC ids differ between the bundled app and the backend.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PurchaseStatus } from "@/lib/calculation-snapshot";
import type { PremiumStatus } from "@/lib/purchase.server";

export type { PremiumStatus };

const deviceIdSchema = z.string().min(8).max(128);

export const createSchema = z.object({ deviceId: deviceIdSchema });

export const accessSchema = z.object({
  id: z.string().uuid(),
  accessToken: z.string().uuid(),
});

export const verifySchema = accessSchema.extend({
  transactionId: z.string().min(1).max(200),
});

export const statusSchema = accessSchema.extend({
  status: z.enum(["failed", "cancelled"]),
  reason: z.string().max(300).optional(),
});

export const premiumSchema = z.object({ deviceId: deviceIdSchema });
export const premiumVerifySchema = premiumSchema.extend({
  transactionId: z.string().min(1).max(200),
});

/** Creates the pending receipt row that the paywall is shown for. */
export const createPendingCalculation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data }) => {
    const { createPendingCalculationProvider } = await import("@/lib/purchase.server");
    return createPendingCalculationProvider(data);
  });

/** Current payment status for one calculation. */
export const getPurchaseStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => accessSchema.parse(input))
  .handler(async ({ data }) => {
    const { getPurchaseStatusProvider } = await import("@/lib/purchase.server");
    return getPurchaseStatusProvider(data);
  });

/** Spends one free recalculation on an already paid calculation. */
export const claimCalculationRevision = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => accessSchema.parse(input))
  .handler(async ({ data }) => {
    const { claimCalculationRevisionProvider } = await import("@/lib/purchase.server");
    return claimCalculationRevisionProvider(data);
  });

/** Records a cancelled or failed purchase attempt without losing the row. */
export const markPurchaseOutcome = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data }): Promise<{ status: PurchaseStatus }> => {
    const { markPurchaseOutcomeProvider } = await import("@/lib/purchase.server");
    return markPurchaseOutcomeProvider(data);
  });

/** Verifies the App Store transaction with Apple and unlocks on success. */
export const verifyApplePurchase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data }) => {
    const { verifyApplePurchaseProvider } = await import("@/lib/purchase.server");
    return verifyApplePurchaseProvider(data);
  });

/** Receipts for calculations purchased on this device. No calculation data. */
export const listPurchasedCalculations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data }) => {
    const { listPurchasedCalculationsProvider } = await import("@/lib/purchase.server");
    return listPurchasedCalculationsProvider(data);
  });

/** Live Premium entitlement for this device. Never trusts the client. */
export const getPremiumStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => premiumSchema.parse(input))
  .handler(async ({ data }): Promise<PremiumStatus> => {
    const { getPremiumStatusProvider } = await import("@/lib/purchase.server");
    return getPremiumStatusProvider(data);
  });

/** Verifies a StoreKit subscription transaction and binds it to this device. */
export const verifyApplePremium = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => premiumVerifySchema.parse(input))
  .handler(async ({ data }) => {
    const { verifyApplePremiumProvider } = await import("@/lib/purchase.server");
    return verifyApplePremiumProvider(data);
  });
