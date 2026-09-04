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
import { PREMIUM_QUERY_KEY } from "@/hooks/use-premium";

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
          await queryClient.invalidateQueries({ queryKey: PREMIUM_QUERY_KEY });
          await queryClient.invalidateQueries({ queryKey: ["purchase-status"] });
        } else if (premium.status === "failed") {
          await transaction.finish();
        } else {
          // Apple has not propagated it yet — try again on the next drain.
          transaction.requeue();
        }
        continue;
      }

      // A one-off unlock may only be applied to the calculation the paywall is
      // currently open for. Falling back to `active` could attach an old,
      // unverified transaction to a different calculation than the one it was
      // paid for. With no pending calculation the transaction stays unfinished
      // and queued as a credit — the next drain (right after the user creates a
      // calculation) applies it, and StoreKit keeps redelivering it meanwhile.
      const ref = store.pending;
      if (!ref) {
        store.setUnclaimedUnlock(true);
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
        usePurchaseStore.getState().setUnclaimedUnlock(false);
        usePurchaseStore.getState().rememberToken(ref);
        await queryClient.invalidateQueries({ queryKey: ["purchase-status"] });
        await queryClient.invalidateQueries({ queryKey: ["purchased-calculations"] });
      } else if (verified.status === "failed") {
        // Apple rejected it for good — finishing stops endless redelivery.
        await transaction.finish();
        usePurchaseStore.getState().setUnclaimedUnlock(false);
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
