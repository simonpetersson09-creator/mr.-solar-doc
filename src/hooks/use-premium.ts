import { useQuery } from "@tanstack/react-query";
import { getPremiumStatus } from "@/lib/purchase.functions";
import { usePurchaseStore } from "@/state/purchase-store";

export const PREMIUM_QUERY_KEY = ["premium-status"] as const;

/**
 * Premium entitlement. The answer always comes from the server, which re-checks
 * the subscription with Apple — local state can never grant Premium.
 */
export function usePremium(): {
  isLoading: boolean;
  active: boolean;
  expiresAt: string | null;
  autoRenew: boolean;
} {
  const ensureDeviceId = usePurchaseStore((s) => s.ensureDeviceId);

  const query = useQuery({
    queryKey: PREMIUM_QUERY_KEY,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => getPremiumStatus({ data: { deviceId: ensureDeviceId() } }),
  });

  return {
    isLoading: query.isLoading,
    active: query.data?.active ?? false,
    expiresAt: query.data?.expiresAt ?? null,
    autoRenew: query.data?.autoRenew ?? false,
  };
}
