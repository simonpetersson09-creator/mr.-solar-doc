import { useEffect } from "react";
import { QueryClient } from "@tanstack/react-query";
import { premiumQueryOptions, PREMIUM_QUERY_KEY } from "@/hooks/use-premium";
import { initializePurchases, getPurchaseDiagnostics } from "@/services/iap-service";
import { drainPurchaseTransactions } from "@/services/purchase-recovery";
import { usePurchaseStore } from "@/state/purchase-store";
import { useWizardStore } from "@/state/wizard-store";
import { startAppOpenAd, setAdLaunchPath, markAdInteraction } from "@/services/app-open-ad";
import { useRouter } from "@tanstack/react-router";
import { createAdPremiumResolver } from "@/services/ad-premium-resolver";

/** No advertising work before authoritative entitlement readiness. */
export function useAppOpenAd(queryClient: QueryClient) {
  const router = useRouter();
  useEffect(() => {
    setAdLaunchPath(router.state.location.pathname);
    const unsubscribe = router.subscribe("onBeforeNavigate", ({ toLocation }) => setAdLaunchPath(toLocation.pathname));
    // A guide restored from storage is the app's normal start screen from the
    // second launch onward (step 1), so it must not cancel this launch's ad.
    // Only a wizard change made now — starting the guide or editing an answer —
    // counts as interaction and cancels it.
    const unsubscribeWizard = useWizardStore.subscribe((state) => { if (state.hasStarted) markAdInteraction("wizard_started"); });
    startAppOpenAd(createAdPremiumResolver({
      // The purchase service retains its own one-shot adapter guard and lock.
      initialize: initializePurchases,
      initialized: () => getPurchaseDiagnostics().initialized,
      drain: () => drainPurchaseTransactions(queryClient),
      cachedActive: () => queryClient.getQueryData<{ active: boolean }>(PREMIUM_QUERY_KEY)?.active === true,
      fetchStatus: async () => {
        const deviceId = usePurchaseStore.getState().ensureDeviceId();
        // The resolver owns the bounded retry budget, not nested query retries.
        return queryClient.fetchQuery({ ...premiumQueryOptions(deviceId), staleTime: 0, retry: false });
      },
    }));
    return () => { unsubscribe(); unsubscribeWizard(); };
  }, [queryClient, router]);
}
