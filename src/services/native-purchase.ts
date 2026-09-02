/**
 * Native-only transport for the paywall. Uses the stable REST route
 * `/api/public/purchase` instead of server-function RPC ids, which drift
 * between the bundled native frontend and the published backend.
 */

import { NATIVE_BACKEND_URL } from "@/config/native-backend";

export const NATIVE_PURCHASE_PATH = "/api/public/purchase";

export type NativePurchaseAction =
  | "createPendingCalculation"
  | "getPurchaseStatus"
  | "claimCalculationRevision"
  | "markPurchaseOutcome"
  | "verifyApplePurchase"
  | "listPurchasedCalculations"
  | "getPremiumStatus"
  | "verifyApplePremium";

export class NativePurchaseError extends Error {
  readonly endpoint = NATIVE_PURCHASE_PATH;
  readonly status: number | "NETWORK";
  readonly action: NativePurchaseAction;

  constructor(action: NativePurchaseAction, status: number | "NETWORK", options?: ErrorOptions) {
    super(`NATIVE_PURCHASE_FAILED_${action}_${status}`, options);
    this.name = "NativePurchaseError";
    this.action = action;
    this.status = status;
  }
}

export async function callNativePurchase<T>(
  action: NativePurchaseAction,
  payload: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${NATIVE_BACKEND_URL}${NATIVE_PURCHASE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action, payload }),
    });
  } catch (error) {
    throw new NativePurchaseError(action, "NETWORK", { cause: error });
  }

  if (!response.ok) throw new NativePurchaseError(action, response.status);
  return (await response.json()) as T;
}
