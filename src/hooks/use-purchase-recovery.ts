import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { initializePurchases, isPurchaseSupported } from "@/services/iap-service";
import { drainPurchaseTransactions } from "@/services/purchase-recovery";

/**
 * Recovers purchases that StoreKit approved but that never reached
 * verification — app closed mid-purchase, network dropped, server hiccup.
 *
 * StoreKit redelivers unfinished transactions on every app start. Here we boot
 * the store early and verify anything it hands over; the shared drain keeps
 * unresolved transactions queued so nothing is lost.
 */
export function usePurchaseRecovery(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isPurchaseSupported()) return;
    let cancelled = false;

    const drain = () => drainPurchaseTransactions(queryClient);

    let appStateHandle: { remove: () => void } | undefined;

    void (async () => {
      await initializePurchases();
      if (cancelled) return;
      // StoreKit delivers unfinished transactions shortly after initialize().
      for (const delay of [500, 2500, 6000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (cancelled) return;
        await drain();
      }

      // Apple may deliver/finish a transaction while the app is backgrounded
      // (renewal, pending purchase, restore). Re-drain whenever the app returns
      // to the foreground so premium/purchase status refreshes without a cold
      // start. No-op in the browser (plugin unavailable).
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;
        appStateHandle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive && !cancelled) void drain();
        });
      } catch {
        /* @capacitor/app unavailable (web) — resume handling is native-only */
      }
    })();

    return () => {
      cancelled = true;
      appStateHandle?.remove();
    };
  }, [queryClient]);
}
