/**
 * Single entry point for all paywall calls from the UI.
 *
 * Web keeps the existing TanStack server functions (same-origin RPC). Native
 * goes through the stable REST route, because RPC ids are version-bound and
 * differ between the bundled app and the published backend.
 *
 * The `{ data }` call shape mirrors the server functions so call sites are
 * transport-agnostic.
 */

import {
  claimCalculationRevision,
  createPendingCalculation,
  getPremiumStatus,
  getPurchaseStatus,
  listPurchasedCalculations,
  markPurchaseOutcome,
  unlockWithPremium,
  verifyApplePremium,
  verifyApplePurchase,
  type PremiumStatus,
} from "@/lib/purchase.functions";
import { isNativePlatform } from "@/services/native-service";
import { callNativePurchase } from "@/services/native-purchase";

type Fn<TIn, TOut> = (args: { data: TIn }) => Promise<TOut>;

function route<TIn, TOut>(
  action: Parameters<typeof callNativePurchase>[0],
  webFn: Fn<TIn, TOut>,
): Fn<TIn, TOut> {
  return async ({ data }) =>
    isNativePlatform()
      ? await callNativePurchase<TOut>(action, data)
      : await webFn({ data });
}

export const startPendingCalculation = route(
  "createPendingCalculation",
  createPendingCalculation as Fn<{ deviceId: string }, { id: string; accessToken: string }>,
);

export const fetchPurchaseStatus = route(
  "getPurchaseStatus",
  getPurchaseStatus as Fn<
    { id: string; accessToken: string },
    Awaited<ReturnType<typeof getPurchaseStatus>>
  >,
);

export const claimRevision = route(
  "claimCalculationRevision",
  claimCalculationRevision as Fn<
    { id: string; accessToken: string },
    Awaited<ReturnType<typeof claimCalculationRevision>>
  >,
);

export const reportPurchaseOutcome = route(
  "markPurchaseOutcome",
  markPurchaseOutcome as Fn<
    { id: string; accessToken: string; status: "failed" | "cancelled"; reason?: string },
    Awaited<ReturnType<typeof markPurchaseOutcome>>
  >,
);

export const verifyPurchase = route(
  "verifyApplePurchase",
  verifyApplePurchase as Fn<
    { id: string; accessToken: string; transactionId: string },
    Awaited<ReturnType<typeof verifyApplePurchase>>
  >,
);

export const fetchPurchasedCalculations = route(
  "listPurchasedCalculations",
  listPurchasedCalculations as Fn<
    { deviceId: string },
    Awaited<ReturnType<typeof listPurchasedCalculations>>
  >,
);

export const fetchPremiumStatus = route(
  "getPremiumStatus",
  getPremiumStatus as Fn<{ deviceId: string }, PremiumStatus>,
);

export const verifyPremium = route(
  "verifyApplePremium",
  verifyApplePremium as Fn<
    { deviceId: string; transactionId: string },
    Awaited<ReturnType<typeof verifyApplePremium>>
  >,
);

export const unlockCalculationWithPremium = route(
  "unlockWithPremium",
  unlockWithPremium as Fn<
    { id: string; accessToken: string; deviceId: string },
    Awaited<ReturnType<typeof unlockWithPremium>>
  >,
);
