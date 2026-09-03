import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPurchaseDiagnostics,
  getStorePrices,
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
  /**
   * `loading` while StoreKit is still delivering products, `ready` once at least
   * one price arrived, `unavailable` when the lookup gave up. The UI must never
   * stay in `loading` forever — that is what looked like a frozen paywall.
   */
  status: "loading" | "ready" | "unavailable";
  diagnostics: PurchaseDiagnostics;
  /** Re-asks StoreKit for products; used by the visible retry action. */
  retry: () => void;
}

/** Bounded polling so the UI can never get stuck on "fetching price" forever. */
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 20_000;

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
        diagnostics: getPurchaseDiagnostics(),
      };
      setState((previous) =>
        previous.available === next.available &&
        previous.unlock === next.unlock &&
        previous.premium === next.premium &&
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
    const interval = setInterval(() => {
      read();
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        // Give up loudly: the UI switches from "fetching price" to an explicit
        // error with a retry action instead of spinning forever.
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
