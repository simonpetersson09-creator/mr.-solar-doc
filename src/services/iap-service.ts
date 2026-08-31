/**
 * UI -> IAP service -> StoreKit (via the native shell's purchase plugin).
 *
 * Purchases are only possible inside the native iOS app. On the web the service
 * reports "unavailable" so the paywall can explain that the unlock is bought in
 * the app with the user's Apple account.
 */

import { UNLOCK_PRODUCT_ID } from "@/config/purchase";
import { getPlatform, isNativePlatform } from "@/services/native-service";

export type PurchaseFailure = "unavailable" | "cancelled" | "failed";

export class PurchaseError extends Error {
  readonly reason: PurchaseFailure;
  constructor(reason: PurchaseFailure, message?: string) {
    super(message ?? reason);
    this.reason = reason;
    this.name = "PurchaseError";
  }
}

interface CdvTransaction {
  transactionId?: string;
  finish?: () => Promise<void> | void;
  state?: string;
}

interface CdvStore {
  register: (products: unknown[]) => void;
  initialize: (platforms?: unknown[]) => Promise<unknown>;
  when: () => {
    approved: (cb: (transaction: CdvTransaction) => void) => unknown;
    cancelled: (cb: (product: unknown) => void) => unknown;
  };
  error: (cb: (error: { code?: number; message?: string }) => void) => void;
  get: (productId: string, platform?: string) => { getOffer?: () => { order: () => Promise<unknown> } } | undefined;
  restorePurchases: () => Promise<unknown>;
  products?: { id: string; pricing?: { price?: string } }[];
}

interface CdvPurchaseGlobal {
  store: CdvStore;
  ProductType: { CONSUMABLE: string };
  Platform: { APPLE_APPSTORE: string };
}

function getCdv(): CdvPurchaseGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { CdvPurchase?: CdvPurchaseGlobal }).CdvPurchase ?? null;
}

/** True only when a real App Store purchase can be started. */
export function isPurchaseAvailable(): boolean {
  return isNativePlatform() && getPlatform() === "ios" && getCdv() !== null;
}

let initialized = false;
let approvedHandler: ((transaction: CdvTransaction) => void) | null = null;
let cancelledHandler: (() => void) | null = null;
let errorHandler: ((message: string) => void) | null = null;

/**
 * Transactions StoreKit approved while no purchase flow was listening — for
 * example when the app was closed or the network died before verification.
 * They must be verified and finished on the next app start, otherwise the user
 * has paid without getting access.
 */
const unclaimed: CdvTransaction[] = [];

function handleApproved(transaction: CdvTransaction) {
  if (approvedHandler) {
    approvedHandler(transaction);
    return;
  }
  unclaimed.push(transaction);
}

function ensureInitialized(cdv: CdvPurchaseGlobal): Promise<void> {
  if (initialized) return Promise.resolve();
  const { store, ProductType, Platform } = cdv;
  store.register([
    {
      id: UNLOCK_PRODUCT_ID,
      type: ProductType.CONSUMABLE,
      platform: Platform.APPLE_APPSTORE,
    },
  ]);
  store.when().approved(handleApproved);
  store.when().cancelled(() => cancelledHandler?.());
  store.error((error) => errorHandler?.(error.message ?? "store-error"));
  initialized = true;
  return store.initialize([Platform.APPLE_APPSTORE]).then(() => undefined);
}

/** Boots StoreKit at app start so unfinished transactions are delivered. */
export async function initializePurchases(): Promise<void> {
  const cdv = getCdv();
  if (!isPurchaseAvailable() || !cdv) return;
  await ensureInitialized(cdv);
}

/** Hands over transactions StoreKit delivered outside an active purchase flow. */
export function takeUnclaimedTransactions(): {
  transactionId: string;
  finish: () => Promise<void>;
}[] {
  const taken = unclaimed.splice(0, unclaimed.length);
  return taken.flatMap((transaction) => {
    const transactionId = transaction.transactionId;
    if (!transactionId) return [];
    return [
      {
        transactionId,
        finish: async () => {
          await transaction.finish?.();
        },
      },
    ];
  });
}

/** Formatted App Store price, when StoreKit has loaded it. */
export function getStorePrice(): string | null {
  const cdv = getCdv();
  const product = cdv?.store.products?.find((item) => item.id === UNLOCK_PRODUCT_ID);
  return product?.pricing?.price ?? null;
}


/**
 * Starts the App Store purchase and resolves with the transaction id once the
 * user has approved it. The transaction is only finished after the server has
 * verified it with Apple.
 */
export async function purchaseUnlock(): Promise<{
  transactionId: string;
  finish: () => Promise<void>;
}> {
  const cdv = getCdv();
  if (!isPurchaseAvailable() || !cdv) throw new PurchaseError("unavailable");

  await ensureInitialized(cdv);

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      approvedHandler = null;
      cancelledHandler = null;
      errorHandler = null;
      fn();
    };

    approvedHandler = (transaction) => {
      const transactionId = transaction.transactionId;
      if (!transactionId) {
        settle(() => reject(new PurchaseError("failed", "Missing transaction id")));
        return;
      }
      settle(() =>
        resolve({
          transactionId,
          finish: async () => {
            await transaction.finish?.();
          },
        }),
      );
    };
    cancelledHandler = () => settle(() => reject(new PurchaseError("cancelled")));
    errorHandler = (message) => settle(() => reject(new PurchaseError("failed", message)));

    const offer = cdv.store.get(UNLOCK_PRODUCT_ID, cdv.Platform.APPLE_APPSTORE)?.getOffer?.();
    if (!offer) {
      settle(() => reject(new PurchaseError("unavailable", "Product not available")));
      return;
    }
    offer.order().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      settle(() => reject(new PurchaseError(/cancel/i.test(message) ? "cancelled" : "failed", message)));
    });
  });
}

/** Asks StoreKit to restore previous purchases (used from settings). */
export async function restorePurchases(): Promise<void> {
  const cdv = getCdv();
  if (!isPurchaseAvailable() || !cdv) throw new PurchaseError("unavailable");
  await ensureInitialized(cdv);
  await cdv.store.restorePurchases();
}
