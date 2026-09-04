import { useEffect } from "react";
import { queryOptions, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchPremiumStatus } from "@/services/purchase-service";
import { usePurchaseStore } from "@/state/purchase-store";

export const PREMIUM_QUERY_KEY = ["premium-status"] as const;

/** How often an open session re-checks the subscription with the server. */
const PREMIUM_REFRESH_MS = 5 * 60_000;

export function premiumQueryOptions(deviceId: string) {
  return queryOptions({
    queryKey: PREMIUM_QUERY_KEY,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => fetchPremiumStatus({ data: { deviceId } }),
  });
}

/**
 * Reads the current entitlement straight from the server, bypassing the cache.
 * Used at decision points (start a calculation, open the paywall) where a
 * stale "not premium" would charge a subscriber twice.
 */
export async function fetchFreshPremium(queryClient: QueryClient): Promise<boolean> {
  const deviceId = usePurchaseStore.getState().ensureDeviceId();
  try {
    const data = await queryClient.fetchQuery({
      ...premiumQueryOptions(deviceId),
      staleTime: 0,
    });
    return data?.active ?? false;
  } catch {
    // Network trouble: fall back to whatever the cache last knew.
    return (
      queryClient.getQueryData<{ active?: boolean }>(PREMIUM_QUERY_KEY)?.active ?? false
    );
  }
}

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
  const queryClient = useQueryClient();

  const query = useQuery({
    ...premiumQueryOptions(ensureDeviceId()),
    // A subscription can lapse while the app stays open; re-check periodically
    // and whenever the user returns to the app instead of trusting the cache.
    refetchOnWindowFocus: true,
    refetchInterval: PREMIUM_REFRESH_MS,
  });

  const expiresAt = query.data?.expiresAt ?? null;

  // Re-check exactly when the current period ends so an expiry mid-session is
  // noticed without waiting for the next poll.
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return;
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: PREMIUM_QUERY_KEY });
    }, Math.min(ms + 1_000, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [expiresAt, queryClient]);

  return {
    isLoading: query.isLoading,
    active: query.data?.active ?? false,
    expiresAt,
    autoRenew: query.data?.autoRenew ?? false,
  };
}
