import { useEffect, useState } from "react";
import {
  getPurchaseDiagnostics,
  getStorePrices,
  initializePurchases,
  isPurchaseAvailable,
  subscribeToStore,
  type PurchaseDiagnostics,
} from "@/services/iap-service";

export interface StorePricesState {
  /** True once a real App Store purchase can be started. */
  available: boolean;
  unlock: string | null;
  premium: string | null;
  diagnostics: PurchaseDiagnostics;
}

/** Bounded polling so the UI can never get stuck on "fetching price" forever. */
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

/**
 * Boots StoreKit for whichever screen shows prices (paywall opened directly,
 * settings, or after a cold start) and keeps prices reactive: the Cordova
 * plugin and its products arrive asynchronously, often after React mounted.
 */
export function useStorePrices(): StorePricesState {
  const [state, setState] = useState<StorePricesState>(() => ({
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
      const next: StorePricesState = {
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

    read();
    const unsubscribe = subscribeToStore(read);
    void initializePurchases().then(read);

    const started = Date.now();
    const interval = setInterval(() => {
      read();
      if (Date.now() - started > POLL_TIMEOUT_MS) clearInterval(interval);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return state;
}
