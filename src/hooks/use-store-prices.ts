import { useCallback, useEffect, useRef, useState } from "react";
import { PREMIUM_PRODUCT_ID, UNLOCK_PRODUCT_ID } from "@/config/purchase";
import {
  getPurchaseDiagnostics,
  getStorePrices,
  hasPurchasableOffer,
  initializePurchases,
  isPurchaseAvailable,
  isPurchaseSupported,
  refreshStoreProducts,
  subscribeToStore,
  type PurchaseDiagnostics,
} from "@/services/iap-service";

export interface StorePricesState {
  /** True once a real App Store purchase can be started. */
  available: boolean;
  unlock: string | null;
  premium: string | null;
  /** True when StoreKit has a purchasable offer for that product right now. */
  unlockReady: boolean;
  premiumReady: boolean;
  /**
   * `loading` while StoreKit is still delivering products, `ready` once at least
   * one price arrived, `unavailable` when the lookup gave up. The UI must never
   * stay in `loading` forever — that is what looked like a frozen paywall.
   * `unavailable` is a product-loading problem, never a failed payment.
   */
  status: "loading" | "ready" | "unavailable";
  /**
   * Per-product status, so a missing/unapproved product never blocks the other
   * one. A product is only `ready` with both a localized price and an offer.
   */
  unlockStatus: "loading" | "ready" | "unavailable";
  premiumStatus: "loading" | "ready" | "unavailable";
  /**
   * True when the plugin can still perform a real product reload. False means a
   * "try again" button would be a no-op, so the UI must not offer one.
   */
  canRetry: boolean;
  diagnostics: PurchaseDiagnostics;
  /** Re-asks StoreKit for products; used by the visible retry action. */
  retry: () => void;
}


/** Bounded polling so the UI can never get stuck on "fetching price" forever. */
const POLL_INTERVAL_MS = 500;
/**
 * Apple Sandbox (App Review devices) is regularly much slower than production,
 * so the window is generous and refreshes are attempted along the way. Giving
 * up only changes the *message* — it never means a purchase failed.
 */
const POLL_TIMEOUT_MS = 45_000;
const REFRESH_AT_MS = [7_000, 18_000, 30_000];


/**
 * Boots StoreKit for whichever screen shows prices (paywall opened directly,
 * settings, or after a cold start) and keeps prices reactive: the Cordova
 * plugin and its products arrive asynchronously, often after React mounted.
 */
export function useStorePrices(): StorePricesState {
  const [gaveUp, setGaveUp] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const readRef = useRef<() => void>(() => undefined);
  const [state, setState] = useState<Omit<StorePricesState, "status" | "retry">>(() => ({
    available: false,
    unlock: null,
    premium: null,
    unlockReady: false,
    premiumReady: false,
    diagnostics: {
      pluginPresent: false,
      supported: false,
      initialized: false,
      ready: false,
      productCount: 0,
      productIds: [],
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  }));

  useEffect(() => {
    let cancelled = false;

    const read = () => {
      if (cancelled) return;
      const prices = getStorePrices();
      const next = {
        available: isPurchaseAvailable(),
        unlock: prices.unlock,
        premium: prices.premium,
        unlockReady: hasPurchasableOffer(UNLOCK_PRODUCT_ID),
        premiumReady: hasPurchasableOffer(PREMIUM_PRODUCT_ID),
        diagnostics: getPurchaseDiagnostics(),
      };
      setState((previous) =>
        previous.available === next.available &&
        previous.unlock === next.unlock &&
        previous.premium === next.premium &&
        previous.unlockReady === next.unlockReady &&
        previous.premiumReady === next.premiumReady &&
        previous.diagnostics.productCount === next.diagnostics.productCount &&
        previous.diagnostics.pluginPresent === next.diagnostics.pluginPresent &&
        previous.diagnostics.ready === next.diagnostics.ready &&
        previous.diagnostics.lastErrorMessage === next.diagnostics.lastErrorMessage
          ? previous
          : next,
      );
    };

    readRef.current = read;

    read();
    const unsubscribe = subscribeToStore(read);
    void initializePurchases().then(read);

    const started = Date.now();
    const refreshes = [...REFRESH_AT_MS];
    const interval = setInterval(() => {
      read();
      const elapsed = Date.now() - started;
      const prices = getStorePrices();
      const missing = prices.unlock === null && prices.premium === null;
      // Automatic retry with backoff while StoreKit has still not answered.
      if (missing && refreshes.length > 0 && elapsed > refreshes[0]!) {
        refreshes.shift();
        if (isPurchaseSupported()) void refreshStoreProducts().then(() => readRef.current());
      }
      if (elapsed > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        // Only the *message* changes: the price could not be fetched. This is
        // never presented as a failed purchase.
        if (!cancelled && isPurchaseSupported()) setGaveUp(true);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(interval);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setGaveUp(false);
    setAttempt((value) => value + 1);
    void refreshStoreProducts().then(() => readRef.current());
  }, []);


  const hasPrice = state.unlock !== null || state.premium !== null;
  const status: StorePricesState["status"] = hasPrice
    ? "ready"
    : gaveUp
      ? "unavailable"
      : "loading";

  return { ...state, status, retry };
}
