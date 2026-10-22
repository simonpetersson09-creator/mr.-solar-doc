import { useEffect } from "react";
import { fetchPremiumStatus } from "@/services/purchase-service";
import { usePurchaseStore } from "@/state/purchase-store";
import { startAppOpenAd } from "@/services/app-open-ad";

/** Kicks off the iOS cold-start App Open ad once. No-op on Android and web. */
export function useAppOpenAd() {
  useEffect(() => {
    startAppOpenAd(async () => {
      const deviceId = usePurchaseStore.getState().ensureDeviceId();
      const res = await fetchPremiumStatus({ data: { deviceId } });
      return res?.active ?? false;
    });
  }, []);
}
