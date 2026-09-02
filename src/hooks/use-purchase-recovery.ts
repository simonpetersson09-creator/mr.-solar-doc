import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  initializePurchases,
  isPurchaseSupported,
  takeUnclaimedTransactions,
} from "@/services/iap-service";
import { verifyPremium, verifyPurchase } from "@/services/purchase-service";
import { PREMIUM_PRODUCT_ID } from "@/config/purchase";
import { usePurchaseStore } from "@/state/purchase-store";

/**
 * Recovers purchases that StoreKit approved but that never reached
 * verification — app closed mid-purchase, network dropped, server hiccup.
 *
 * StoreKit redelivers unfinished transactions on every app start. Here we boot
 * the store early, verify anything it hands over against the calculation the
 * device was buying, and only finish the transaction once the server says
 * "paid". Transient failures leave the transaction unfinished so Apple will
 * deliver it again next time.
 */
export function usePurchaseRecovery(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isPurchaseSupported()) return;
    let cancelled = false;

    async function drain() {
      const store = usePurchaseStore.getState();
      for (const transaction of takeUnclaimedTransactions()) {
        try {
          // Subscription transactions (first purchase, renewal, restore/sync)
          // are bound to the device, not to a single calculation.
          if (transaction.productId === PREMIUM_PRODUCT_ID) {
            const premium = await verifyPremium({
              data: {
                deviceId: store.ensureDeviceId(),
                transactionId: transaction.transactionId,
              },
            });
            if (premium.status === "active" || premium.status === "inactive") {
              await transaction.finish();
              await queryClient.invalidateQueries({ queryKey: ["premium-status"] });
              await queryClient.invalidateQueries({ queryKey: ["purchase-status"] });
            } else if (premium.status === "failed") {
              await transaction.finish();
            }
            continue;
          }

          const ref = store.pending ?? store.active;
          if (!ref) continue;
          const verified = await verifyPurchase({
            data: {
              id: ref.id,
              accessToken: ref.accessToken,
              transactionId: transaction.transactionId,
            },
          });
          if (verified.status === "paid") {
            await transaction.finish();
            usePurchaseStore.getState().rememberToken(ref);
            await queryClient.invalidateQueries({ queryKey: ["purchase-status"] });
            await queryClient.invalidateQueries({ queryKey: ["purchased-calculations"] });
          } else if (verified.status === "failed") {
            // Apple rejected it for good — finishing stops endless redelivery.
            await transaction.finish();
          }
        } catch {
          /* keep the transaction unfinished so it is redelivered */
        }
      }
    }

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
