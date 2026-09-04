/**
 * UI -> IAP service -> StoreKit (via cordova-plugin-purchase).
 *
 * Purchases are only possible inside the native iOS app. On the web the service
 * reports "unavailable" so the paywall can explain that the unlock is bought in
 * the app with the user's Apple account.
 *
 * Timing is the hard part on device: the Cordova plugin is injected
 * asynchronously (after `deviceready`), which can happen *after* React has
 * mounted. Nothing here may therefore cache "no plugin" as a permanent answer;
 * we wait for the plugin, initialise exactly once, and notify subscribers when
 * StoreKit finally delivers products and localized prices.
 */

import { PREMIUM_PRODUCT_ID, UNLOCK_PRODUCT_ID } from "@/config/purchase";
import { getPlatform, isNativePlatform } from "@/services/native-service";

export type PurchaseFailure = "unavailable" | "cancelled" | "failed";

export class PurchaseError extends Error {
  readonly reason: PurchaseFailure;
  /** Raw StoreKit/plugin error code, when the plugin provided one. */
  readonly code: number | null;
  /** Original, untranslated message kept for diagnostics/logging. */
  readonly detail: string | null;
  constructor(
    reason: PurchaseFailure,
    message?: string,
    options: { code?: number | null; detail?: string | null } = {},
  ) {
    super(message ?? reason);
    this.reason = reason;
    this.name = "PurchaseError";
    this.code = options.code ?? null;
    this.detail = options.detail ?? message ?? null;
  }
}

interface CdvTransaction {
  transactionId?: string;
  finish?: () => Promise<void> | void;
  state?: string;
  products?: { id?: string }[];
}

interface CdvPricingPhase {
  price?: string;
  priceMicros?: number;
  currency?: string;
}

interface CdvProduct {
  id: string;
  pricing?: { price?: string };
  offers?: { pricingPhases?: CdvPricingPhase[] }[];
}

interface CdvStore {
  register: (products: unknown[]) => void;
  initialize: (platforms?: unknown[]) => Promise<unknown>;
  when: () => {
    approved: (cb: (transaction: CdvTransaction) => void) => unknown;
    cancelled: (cb: (product: unknown) => void) => unknown;
    productUpdated?: (cb: (product: unknown) => void) => unknown;
    updated?: (cb: (product: unknown) => void) => unknown;
  };
  ready?: (cb: () => void) => void;
  error: (cb: (error: { code?: number; message?: string }) => void) => void;
  get: (
    productId: string,
    platform?: string,
  ) => { getOffer?: () => { order: () => Promise<unknown> } } | undefined;
  restorePurchases: () => Promise<unknown>;
  /** Re-queries the App Store for products/prices (v13 `store.update()`). */
  update?: () => Promise<unknown> | unknown;
  products?: CdvProduct[];
}

interface CdvPurchaseGlobal {
  store: CdvStore;
  ProductType: { CONSUMABLE: string; PAID_SUBSCRIPTION: string };
  Platform: { APPLE_APPSTORE: string };
}

function getCdv(): CdvPurchaseGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { CdvPurchase?: CdvPurchaseGlobal }).CdvPurchase ?? null;
}

/** True on a platform where StoreKit purchases can exist (plugin may still be loading). */
export function isPurchaseSupported(): boolean {
  return isNativePlatform() && getPlatform() === "ios";
}

/**
 * True only when a real App Store purchase can be started right now.
 * Never cache the result: the plugin is injected asynchronously, so a `false`
 * answer can become `true` moments later.
 */
export function isPurchaseAvailable(): boolean {
  return isPurchaseSupported() && getCdv() !== null;
}

/* ------------------------------------------------------------------ *
 * Diagnostics (development / TestFlight only surface, always logged)
 * ------------------------------------------------------------------ */

export interface PurchaseDiagnostics {
  pluginPresent: boolean;
  supported: boolean;
  initialized: boolean;
  ready: boolean;
  productCount: number;
  productIds: string[];
  lastErrorCode: number | null;
  lastErrorMessage: string | null;
}

/** Products registered with the plugin — must happen at most once per session. */
let registered = false;
/** True only when `store.initialize()` has actually succeeded. */
let initialized = false;
let initPromise: Promise<void> | null = null;
let storeReady = false;
let lastErrorCode: number | null = null;
let lastErrorMessage: string | null = null;

function log(event: string, payload?: unknown) {
  // Visible in Xcode/Console.app for a TestFlight device — this is how the real
  // StoreKit failure reason is recovered when the UI shows a generic message.
  console.info(`[iap] ${event}`, payload ?? "");
}

function recordError(code: number | null, message: string | null) {
  lastErrorCode = code;
  lastErrorMessage = message;
  console.warn("[iap] store error", { code, message });
}

export function getPurchaseDiagnostics(): PurchaseDiagnostics {
  const cdv = getCdv();
  const products = cdv?.store.products ?? [];
  return {
    pluginPresent: cdv !== null,
    supported: isPurchaseSupported(),
    initialized,
    ready: storeReady,
    productCount: products.length,
    productIds: products.map((product) => product.id),
    lastErrorCode,
    lastErrorMessage,
  };
}

/* ------------------------------------------------------------------ *
 * Store change notifications
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

/** Notified whenever products/prices/readiness may have changed. */
export function subscribeToStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* a broken subscriber must not break StoreKit handling */
    }
  }
}

/* ------------------------------------------------------------------ *
 * Plugin availability
 * ------------------------------------------------------------------ */

/**
 * Resolves once `window.CdvPurchase` exists. Cordova injects the plugin around
 * `deviceready`, which regularly lands after the first React render.
 */
export function waitForPurchasePlugin(timeoutMs = 15_000): Promise<CdvPurchaseGlobal | null> {
  const immediate = getCdv();
  if (immediate) return Promise.resolve(immediate);
  if (typeof window === "undefined" || !isPurchaseSupported()) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: CdvPurchaseGlobal | null) => {
      if (settled) return;
      settled = true;
      window.clearInterval(interval);
      window.clearTimeout(timer);
      document.removeEventListener("deviceready", onDeviceReady);
      resolve(value);
    };
    const check = () => {
      const cdv = getCdv();
      if (cdv) finish(cdv);
    };
    const onDeviceReady = () => check();

    document.addEventListener("deviceready", onDeviceReady, { once: false });
    const interval = window.setInterval(check, 200);
    const timer = window.setTimeout(() => {
      log("plugin wait timed out", { timeoutMs });
      finish(getCdv());
    }, timeoutMs);
    check();
  });
}

/* ------------------------------------------------------------------ *
 * Initialisation
 * ------------------------------------------------------------------ */

/** Set only while a purchase flow is waiting for its own product. */
let approvedHandler: { productId: string; handle: (transaction: CdvTransaction) => void } | null =
  null;
let cancelledHandler: (() => void) | null = null;
let errorHandler: ((message: string, code: number | null) => void) | null = null;
/** True between `offer.order()` and the flow settling. Scopes store errors. */
let orderPlaced = false;

/**
 * Transactions StoreKit approved while no purchase flow was listening — for
 * example when the app was closed or the network died before verification.
 */
const unclaimed: CdvTransaction[] = [];

function handleApproved(transaction: CdvTransaction) {
  const deliveredProductId = transaction.products?.[0]?.id ?? null;
  // Only hand the transaction to the active purchase flow when it is actually
  // the product being bought. StoreKit also redelivers renewals, restores and
  // unfinished transactions mid-flow; resolving the flow with one of those made
  // the server verify the wrong product and report a failed purchase.
  if (approvedHandler && (deliveredProductId === null || deliveredProductId === approvedHandler.productId)) {
    approvedHandler.handle(transaction);
    return;
  }
  if (approvedHandler) {
    log("unrelated transaction queued during purchase", { deliveredProductId });
  }
  unclaimed.push(transaction);
}

function registerAndInitialize(cdv: CdvPurchaseGlobal): Promise<void> {
  const { store, ProductType, Platform } = cdv;
  if (!registered) {
    store.register([
      {
        id: UNLOCK_PRODUCT_ID,
        type: ProductType.CONSUMABLE,
        platform: Platform.APPLE_APPSTORE,
      },
      {
        id: PREMIUM_PRODUCT_ID,
        type: ProductType.PAID_SUBSCRIPTION,
        platform: Platform.APPLE_APPSTORE,
      },
    ]);
    store.when().approved(handleApproved);
    store.when().cancelled(() => cancelledHandler?.());
    const when = store.when();
    when.productUpdated?.(() => emit());
    when.updated?.(() => emit());
    store.ready?.(() => {
      storeReady = true;
      log("store ready", getPurchaseDiagnostics());
      emit();
    });
    store.error((error) => {
      recordError(error.code ?? null, error.message ?? null);
      // Errors that arrive before the order was placed (product loading, an
      // unrelated transaction) must not fail the user's purchase.
      if (orderPlaced) errorHandler?.(error.message ?? "store-error", error.code ?? null);
      emit();
    });
    registered = true;
  }

  return store
    .initialize([Platform.APPLE_APPSTORE])
    .then(() => {
      // Only a resolved initialize() counts as initialised. Marking it earlier
      // made a single transient StoreKit failure permanent: every later call
      // short-circuited, products never loaded and the paywall stayed on
      // "fetching price" with an unresponsive buy button.
      initialized = true;
      log("store initialized", getPurchaseDiagnostics());
      emit();
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      recordError(null, message);
      emit();
      // Allow a later retry: initialisation failed, registration already ran.
      initPromise = null;
      throw new PurchaseError("failed", message, { detail: message });
    });
}

/**
 * Boots StoreKit. Idempotent: products are registered at most once, concurrent
 * callers share the same in-flight promise, and a failed initialisation can
 * always be retried by calling again.
 */
export function initializePurchases(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isPurchaseSupported()) return;
    const cdv = await waitForPurchasePlugin();
    if (!cdv) {
      log("plugin unavailable after wait");
      initPromise = null;
      return;
    }
    if (initialized) {
      emit();
      return;
    }
    await registerAndInitialize(cdv);
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    recordError(lastErrorCode, message);
  });
  return initPromise;
}

/**
 * Asks StoreKit for fresh product data. Used when products are still missing so
 * the UI has a real retry instead of an endless "fetching price".
 */
export async function refreshStoreProducts(): Promise<void> {
  await initializePurchases();
  const cdv = getCdv();
  if (!cdv) return;
  try {
    await cdv.store.update?.();
    log("store update requested", getPurchaseDiagnostics());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordError(lastErrorCode, message);
  }
  emit();
}

/** Waits (bounded) for a product to appear after initialisation. */
export async function waitForProduct(productId: string, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cdv = getCdv();
    if (cdv?.store.products?.some((product) => product.id === productId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return getCdv()?.store.products?.some((product) => product.id === productId) ?? false;
}

export interface UnclaimedTransaction {
  transactionId: string;
  productId: string | null;
  finish: () => Promise<void>;
  /**
   * Puts the transaction back in the queue when verification did not reach a
   * final answer, so the next drain retries it instead of losing it until the
   * app is restarted.
   */
  requeue: () => void;
}

/** Hands over transactions StoreKit delivered outside an active purchase flow. */
export function takeUnclaimedTransactions(): UnclaimedTransaction[] {
  const taken = unclaimed.splice(0, unclaimed.length);
  return taken.flatMap((transaction) => {
    const transactionId = transaction.transactionId;
    if (!transactionId) return [];
    return [
      {
        transactionId,
        productId: transaction.products?.[0]?.id ?? null,
        finish: async () => {
          await transaction.finish?.();
        },
        requeue: () => {
          if (!unclaimed.includes(transaction)) unclaimed.push(transaction);
        },
      },
    ];
  });
}

/* ------------------------------------------------------------------ *
 * Prices
 * ------------------------------------------------------------------ */

/**
 * Formatted App Store price, always Apple's localized string.
 *
 * Consumables expose `pricing.price`; subscriptions in cordova-plugin-purchase
 * v13 expose the price on the offer's pricing phases instead, so both shapes
 * must be read. The last phase is the recurring one, which is the price to show.
 */
export function getStorePrice(productId: string = UNLOCK_PRODUCT_ID): string | null {
  const cdv = getCdv();
  const product = cdv?.store.products?.find((item) => item.id === productId);
  if (!product) return null;
  const direct = product.pricing?.price;
  if (direct) return direct;
  for (const offer of product.offers ?? []) {
    const phases = offer.pricingPhases ?? [];
    for (let index = phases.length - 1; index >= 0; index -= 1) {
      const price = phases[index]?.price;
      if (price) return price;
    }
  }
  return null;
}

/** Both product prices in one read. */
export function getStorePrices(): { unlock: string | null; premium: string | null } {
  return {
    unlock: getStorePrice(UNLOCK_PRODUCT_ID),
    premium: getStorePrice(PREMIUM_PRODUCT_ID),
  };
}

/* ------------------------------------------------------------------ *
 * Purchasing
 * ------------------------------------------------------------------ */

/**
 * Starts the App Store purchase and resolves with the transaction id once the
 * user has approved it. The transaction is only finished after the server has
 * verified it with Apple.
 */
export async function purchaseProduct(productId: string): Promise<{
  transactionId: string;
  productId: string | null;
  finish: () => Promise<void>;
}> {
  await initializePurchases();
  let cdv = getCdv();
  if (!isPurchaseSupported() || !cdv) {
    throw new PurchaseError("unavailable", "StoreKit plugin unavailable");
  }

  // The tap can land before StoreKit delivered the product (slow Sandbox, fresh
  // launch, iPad review device). Ask again and wait briefly instead of failing
  // immediately, which is what made the button look unresponsive.
  const offerReady = () => Boolean(cdv?.store.get(productId, cdv.Platform.APPLE_APPSTORE)?.getOffer?.());
  if (!offerReady()) {
    await refreshStoreProducts();
    await waitForProduct(productId);
    cdv = getCdv();
    if (!cdv) throw new PurchaseError("unavailable", "StoreKit plugin unavailable");
  }
  const active = cdv;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      approvedHandler = null;
      cancelledHandler = null;
      errorHandler = null;
      orderPlaced = false;
      fn();
    };

    approvedHandler = { productId, handle: (transaction) => {
      const transactionId = transaction.transactionId;
      if (!transactionId) {
        settle(() => reject(new PurchaseError("failed", "Missing transaction id")));
        return;
      }
      settle(() =>
        resolve({
          transactionId,
          productId: transaction.products?.[0]?.id ?? productId,
          finish: async () => {
            await transaction.finish?.();
          },
        }),
      );
    } };
    cancelledHandler = () => settle(() => reject(new PurchaseError("cancelled")));
    errorHandler = (message, code) =>
      settle(() =>
        reject(new PurchaseError("failed", message, { code, detail: message })),
      );

    const offer = active.store.get(productId, active.Platform.APPLE_APPSTORE)?.getOffer?.();
    if (!offer) {
      const detail = `No offer for ${productId} (products: ${
        getPurchaseDiagnostics().productIds.join(",") || "none"
      })`;
      console.warn("[iap] purchase blocked", detail);
      settle(() => reject(new PurchaseError("unavailable", detail, { detail })));
      return;
    }
    orderPlaced = true;
    offer.order().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? Number((error as { code?: unknown }).code) || null
          : null;
      console.warn("[iap] order failed", { message, code });
      settle(() =>
        reject(
          new PurchaseError(/cancel/i.test(message) ? "cancelled" : "failed", message, {
            code,
            detail: message,
          }),
        ),
      );
    });
  });
}

/** Buys the single-calculation unlock (consumable). */
export function purchaseUnlock() {
  return purchaseProduct(UNLOCK_PRODUCT_ID);
}

/** Buys the yearly Premium subscription. */
export function purchasePremium() {
  return purchaseProduct(PREMIUM_PRODUCT_ID);
}

/**
 * Restore. The one-off unlock is a consumable and can never be restored, so this
 * targets the subscription: StoreKit syncs with the App Store account and
 * redelivers the current subscription entitlement as an approved transaction,
 * which the recovery hook then verifies server-side.
 */
export async function refreshPurchases(): Promise<void> {
  await initializePurchases();
  const cdv = getCdv();
  if (!isPurchaseSupported() || !cdv) return;
  await cdv.store.restorePurchases();
}

/** Human-readable, untranslated failure detail for logs and outcome reporting. */
export function describePurchaseError(error: unknown): string {
  if (error instanceof PurchaseError) {
    const parts: string[] = [error.reason];
    if (error.code !== null) parts.push(`code=${error.code}`);
    if (error.detail && error.detail !== error.reason) parts.push(error.detail);
    return parts.join(" | ").slice(0, 300);
  }
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

/** Test-only: clears module state so each test starts from a clean store. */
export function __resetIapServiceForTests() {
  initialized = false;
  registered = false;
  initPromise = null;
  storeReady = false;
  lastErrorCode = null;
  lastErrorMessage = null;
  approvedHandler = null;
  cancelledHandler = null;
  errorHandler = null;
  orderPlaced = false;
  unclaimed.length = 0;
  listeners.clear();
}
