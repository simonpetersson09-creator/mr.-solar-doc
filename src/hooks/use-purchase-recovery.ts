import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  initializePurchases,
  isPurchaseAvailable,
  takeUnclaimedTransactions,
} from "@/services/iap-service";
import { verifyApplePurchase } from "@/lib/purchase.functions";
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
    if (!isPurchaseAvailable()) return;
    let cancelled = false;

    async function drain() {
      const store = usePurchaseStore.getState();
      const ref = store.pending ?? store.active;
      if (!ref) return;
      for (const transaction of takeUnclaimedTransactions()) {
        try {
          const verified = await verifyApplePurchase({
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

    void (async () => {
      await initializePurchases();
      if (cancelled) return;
      // StoreKit delivers unfinished transactions shortly after initialize().
      for (const delay of [500, 2500, 6000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (cancelled) return;
        await drain();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);
}
