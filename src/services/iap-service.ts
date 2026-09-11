/**
 * UI -> IAP service -> StoreKit 2 (via capacitor-plugin-cdv-purchase).
 *
 * Purchases are only possible inside the native iOS app. On the web the service
 * reports "unavailable" so the paywall can explain that the unlock is bought in
 * the app with the user's Apple account.
 *
 * The Capacitor package is imported directly, which registers PurchasePlugin
 * before React starts the store. We still notify subscribers asynchronously
 * because StoreKit product metadata can arrive well after initialization.
 */

import {
  CdvPurchase as CapacitorPurchase,
  Platform as CapacitorPlatform,
  ProductType as CapacitorProductType,
  store as capacitorStore,
} from "capacitor-plugin-cdv-purchase";
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

interface CdvError {
  isError?: boolean;
  code?: number;
  message?: string;
  productId?: string | null;
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
  initialize: (platforms?: unknown[]) => Promise<CdvError[]>;
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
  ) => { getOffer?: () => { order: () => Promise<CdvError | undefined> } } | undefined;
  restorePurchases: () => Promise<unknown>;
  /** Re-queries the App Store for products/prices (v13 `store.update()`). */
  update?: () => Promise<unknown> | unknown;
  /** v13: true once every adapter is initialized and its products loaded. */
  isReady?: boolean;
  /** v13 public setting: `update()` is skipped within this many ms. */
  minTimeBetweenUpdates?: number;
  products?: CdvProduct[];
}

interface CdvPurchaseGlobal {
  store: CdvStore;
  ProductType: { CONSUMABLE: string; PAID_SUBSCRIPTION: string };
  Platform: { APPLE_APPSTORE: string };
}

function getCdv(): CdvPurchaseGlobal | null {
  // The window override keeps browser tests deterministic. On device the
  // package exports the one Store instance backed by Capacitor PurchasePlugin.
  const injected =
    typeof window === "undefined"
      ? null
      : (window as unknown as { CdvPurchase?: CdvPurchaseGlobal }).CdvPurchase ?? null;
  if (injected) return injected;
  return {
    store: capacitorStore as unknown as CdvStore,
    ProductType: CapacitorProductType as unknown as CdvPurchaseGlobal["ProductType"],
    Platform: CapacitorPlatform as unknown as CdvPurchaseGlobal["Platform"],
  };
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
/** Plugin v13 only permits one initialize call per Store instance. */
let initializationAttempted = false;
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

function isCancellation(code: number | null, message: string): boolean {
  // cordova-plugin-purchase v13 PAYMENT_CANCELLED.
  return code === 6_777_006 || /cancel/i.test(message);
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
 * Compatibility helper retained for callers and tests. The official Capacitor
 * package is imported synchronously, so native code does not depend on
 * `deviceready` or a late `window.CdvPurchase` global anymore.
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
    // Logged so a TestFlight/App Review device shows exactly which ids were
    // requested versus which ones the App Store actually returned.
    log("registering products", { requested: [UNLOCK_PRODUCT_ID, PREMIUM_PRODUCT_ID] });
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

  initializationAttempted = true;
  return store
    .initialize([Platform.APPLE_APPSTORE])
    .then((errors) => {
      // v13 resolves initialize() with an error array; it does not reject for
      // normal StoreKit setup/product-loading failures. A resolved-with-errors
      // initialisation must NOT be cached as initialised: otherwise a single
      // transient Sandbox failure is permanent and the paywall never recovers.
      if (Array.isArray(errors) && errors.length > 0) {
        const first = errors[0];
        const message = first?.message ?? "StoreKit initialization failed";
        recordError(first?.code ?? null, message);
        log("store initialization returned errors", {
          errors: errors.map((error) => ({
            code: error.code ?? null,
            message: error.message ?? null,
            productId: error.productId ?? null,
          })),
        });
        initialized = false;
        // v13 initialize() is one-shot internally. Do not claim a later call is
        // a real adapter restart; product recovery remains possible only if the
        // Store reached ready and supports update().
        emit();
        return;
      }
      initialized = true;
      log("store initialized", getPurchaseDiagnostics());
      emit();
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      recordError(null, message);
      initialized = false;
      emit();
      throw new PurchaseError("failed", message, { detail: message });
    });
}


/**
 * Boots StoreKit. Idempotent: products are registered at most once, concurrent
 * callers share the same in-flight promise. Plugin v13 has a one-shot adapter
 * initialization; failed adapter startup is therefore reported honestly.
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
    if (initializationAttempted) {
      log("adapter initialization cannot be repeated in this session", getPurchaseDiagnostics());
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
 * True when a *real* product reload can still happen in this session.
 *
 * capacitor-plugin-cdv-purchase v13 facts (same Store runtime):
 *  - `initialize()` is one-shot (`initializedHasBeenCalled`); later calls warn
 *    and resolve with `[]` without touching StoreKit.
 *  - `update()` returns immediately unless `store.isReady` is true, and is
 *    skipped when the previous update happened within `minTimeBetweenUpdates`
 *    (default 600000 ms).
 *
 * So: a *started* adapter can reload products (via `update()`), while an
 * adapter whose initialisation failed has no supported in-session recovery.
 * The UI must say that honestly instead of offering a no-op retry.
 */
export function canRefreshStoreProducts(): boolean {
  const store = getCdv()?.store;
  if (!store) return false;
  return store.isReady === true && typeof store.update === "function";
}

/** Single-flight guard: overlapping manual + automatic retries share one load. */
let refreshPromise: Promise<void> | null = null;

/**
 * Asks StoreKit for fresh product data. Used when products are still missing so
 * the UI has a real retry instead of an endless "fetching price".
 *
 * Registration and listeners are attached once, so this never creates duplicate
 * transaction callbacks or a second Store instance.
 */
export function refreshStoreProducts(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = runRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function runRefresh(): Promise<void> {
  // When initialisation never succeeded this is still the only supported entry
  // point: the very first call does reach StoreKit. Subsequent calls are no-ops
  // inside the plugin, which is exactly why `canRefreshStoreProducts()` exists.
  await initializePurchases();
  const cdv = getCdv();
  if (!cdv) return;
  const { store } = cdv;
  try {
    if (store.isReady === true && typeof store.update === "function") {
      // Supported configuration, not a private flag: relax the throttle only
      // for this active recovery, then restore the plugin default.
      const previous = store.minTimeBetweenUpdates;
      store.minTimeBetweenUpdates = 0;
      try {
        await store.update();
      } finally {
        store.minTimeBetweenUpdates = previous ?? 600_000;
      }
      log("store update requested", getPurchaseDiagnostics());
    } else {
      log("no supported product reload available", getPurchaseDiagnostics());
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordError(lastErrorCode, message);
  }
  emit();
}

function hasAnyProduct(): boolean {
  return (getCdv()?.store.products?.length ?? 0) > 0;
}

/** True when this product has a purchasable StoreKit offer right now. */
export function hasPurchasableOffer(productId: string): boolean {
  const cdv = getCdv();
  if (!cdv || !initialized) return false;
  try {
    return Boolean(cdv.store.get(productId, cdv.Platform.APPLE_APPSTORE)?.getOffer?.());
  } catch {
    return false;
  }
}

/** Waits (bounded) for a product to appear after initialisation. */
export async function waitForProduct(productId: string, timeoutMs = 12_000): Promise<boolean> {
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
  for (const offer of product.offers ?? []) {
    const phases = offer.pricingPhases ?? [];
    for (let index = phases.length - 1; index >= 0; index -= 1) {
      const price = phases[index]?.price;
      if (price) return price;
    }
  }
  return product.pricing?.price ?? null;
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
  log("purchase start", { productId, ...getPurchaseDiagnostics() });
  await initializePurchases();
  let cdv = getCdv();
  if (!isPurchaseSupported() || !cdv) {
    throw new PurchaseError("unavailable", "StoreKit plugin unavailable");
  }

  // The tap can land before StoreKit delivered the product (slow Sandbox, fresh
  // launch, iPad review device). Run the recovery path — re-init and refresh —
  // instead of failing immediately with a generic purchase error.
  const offerReady = () => Boolean(cdv?.store.get(productId, cdv.Platform.APPLE_APPSTORE)?.getOffer?.());
  for (let attempt = 0; attempt < 2 && !offerReady(); attempt += 1) {
    await refreshStoreProducts();
    await waitForProduct(productId, attempt === 0 ? 8000 : 12_000);
    cdv = getCdv();

    if (!cdv) throw new PurchaseError("unavailable", "StoreKit plugin unavailable");
    log("products after refresh", { productId, delivered: getPurchaseDiagnostics().productIds });
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
      log("purchase approved", {
        productId: transaction.products?.[0]?.id ?? productId,
        state: transaction.state ?? null,
      });
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
    cancelledHandler = () => {
      log("purchase cancelled", { productId });
      settle(() => reject(new PurchaseError("cancelled")));
    };
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
    offer.order().then((result) => {
      // cordova-plugin-purchase v13 resolves (rather than rejects) with IError
      // for StoreKit failures, including PAYMENT_CANCELLED. The global error
      // callback normally mirrors this, but handling the documented return
      // value removes a race where the UI could remain stuck on "Purchasing".
      if (!result?.isError) return;
      const message = result.message ?? "StoreKit purchase failed";
      const code = result.code ?? null;
      console.warn("[iap] order failed", { message, code, productId: result.productId ?? productId });
      settle(() =>
        reject(
          new PurchaseError(isCancellation(code, message) ? "cancelled" : "failed", message, {
            code,
            detail: message,
          }),
        ),
      );
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? Number((error as { code?: unknown }).code) || null
          : null;
      console.warn("[iap] order threw", { message, code });
      settle(() =>
        reject(
          new PurchaseError(isCancellation(code, message) ? "cancelled" : "failed", message, {
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
  initializationAttempted = false;
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
