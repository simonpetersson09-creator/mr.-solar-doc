/**
 * Verifies transactions StoreKit delivered outside an active purchase flow:
 * unfinished purchases from a previous session, renewals, and everything
 * "Restore purchases" redelivers.
 *
 * Shared by the app-start/foreground recovery hook and the Restore button, so
 * a restore that happens while the app is in the foreground is verified
 * immediately instead of waiting for the next launch.
 */

import type { QueryClient } from "@tanstack/react-query";
import { takeUnclaimedTransactions } from "@/services/iap-service";
import { verifyPremium, verifyPurchase } from "@/services/purchase-service";
import { PREMIUM_PRODUCT_ID } from "@/config/purchase";
import { usePurchaseStore } from "@/state/purchase-store";

/** Verifies every pending transaction. Returns true if anything was activated. */
export async function drainPurchaseTransactions(queryClient: QueryClient): Promise<boolean> {
  let activated = false;
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
          activated = activated || premium.status === "active";
          await queryClient.invalidateQueries({ queryKey: ["premium-status"] });
          await queryClient.invalidateQueries({ queryKey: ["purchase-status"] });
        } else if (premium.status === "failed") {
          await transaction.finish();
        } else {
          // Apple has not propagated it yet — try again on the next drain.
          transaction.requeue();
        }
        continue;
      }

      const ref = store.pending ?? store.active;
      if (!ref) {
        transaction.requeue();
        continue;
      }
      const verified = await verifyPurchase({
        data: {
          id: ref.id,
          accessToken: ref.accessToken,
          transactionId: transaction.transactionId,
        },
      });
      if (verified.status === "paid") {
        await transaction.finish();
        activated = true;
        usePurchaseStore.getState().rememberToken(ref);
        await queryClient.invalidateQueries({ queryKey: ["purchase-status"] });
        await queryClient.invalidateQueries({ queryKey: ["purchased-calculations"] });
      } else if (verified.status === "failed") {
        // Apple rejected it for good — finishing stops endless redelivery.
        await transaction.finish();
      } else {
        transaction.requeue();
      }
    } catch {
      // Keep the transaction unfinished *and* queued so the next drain retries
      // it instead of losing it until the app is restarted.
      transaction.requeue();
    }
  }

  return activated;
}
