import { useEffect } from "react";
import { QueryClient } from "@tanstack/react-query";
import { premiumQueryOptions, PREMIUM_QUERY_KEY } from "@/hooks/use-premium";
import { initializePurchases, getPurchaseDiagnostics } from "@/services/iap-service";
import { drainPurchaseTransactions } from "@/services/purchase-recovery";
import { usePurchaseStore } from "@/state/purchase-store";
import { useWizardStore } from "@/state/wizard-store";
import { startAppOpenAd, setAdLaunchPath, markAdInteraction } from "@/services/app-open-ad";
import { useRouter } from "@tanstack/react-router";

/** No advertising work before authoritative entitlement readiness. */
export function useAppOpenAd(queryClient: QueryClient) {
  const router = useRouter();
  useEffect(() => {
    setAdLaunchPath(router.state.location.pathname);
    const unsubscribe = router.subscribe("onBeforeNavigate", ({ toLocation }) => setAdLaunchPath(toLocation.pathname));
    if (useWizardStore.getState().hasStarted) markAdInteraction("wizard_resumed");
    const unsubscribeWizard = useWizardStore.subscribe((state) => { if (state.hasStarted) markAdInteraction("wizard_started"); });
    let ready: Promise<unknown> | undefined;
    startAppOpenAd(async () => {
      try {
        // Reuse the store's initialization lock and drain redelivered purchases
        // before the first entitlement check; do not change purchase semantics.
        ready ??= initializePurchases().then(() => drainPurchaseTransactions(queryClient));
        await ready;
        if (!getPurchaseDiagnostics().initialized) return null;
        const deviceId = usePurchaseStore.getState().ensureDeviceId();
        if (queryClient.getQueryData<{ active: boolean }>(PREMIUM_QUERY_KEY)?.active) return true;
        const res = await queryClient.fetchQuery({ ...premiumQueryOptions(deviceId), staleTime: 0 });
        return res.stale && !res.active ? null : res.active;
      } catch { return null; }
    });
    return () => { unsubscribe(); unsubscribeWizard(); };
  }, [queryClient, router]);
}
