import { useQuery } from "@tanstack/react-query";
import { getPurchaseStatus } from "@/lib/purchase.functions";
import { usePurchaseStore } from "@/state/purchase-store";
import { usePremium } from "@/hooks/use-premium";
import { useCalculationStore } from "@/state/calculation-store";
import { getMarketConfig } from "@/config/markets";
import type { CalculationSnapshot } from "@/lib/calculation-snapshot";
import type { CalculationResult } from "@/lib/calc/types";

/**
 * The snapshot is read from local device storage; the server is only asked
 * whether the purchase is verified. Locked calculations render nothing.
 */
export function useUnlockedCalculation(): {
  isLoading: boolean;
  unlocked: boolean;
  result: CalculationResult | null;
  snapshot: CalculationSnapshot | null;
  market: ReturnType<typeof getMarketConfig>;
} {
  const active = usePurchaseStore((s) => s.active);
  const stored = useCalculationStore((s) => (active ? (s.items[active.id] ?? null) : null));

  const query = useQuery({
    queryKey: ["purchase-status", active?.id ?? null],
    enabled: Boolean(active),
    staleTime: Infinity,
    retry: 1,
    queryFn: async () =>
      getPurchaseStatus({
        data: { id: active!.id, accessToken: active!.accessToken },
      }),
  });

  const premium = usePremium();
  // Unlocked when the calculation itself is paid (one-off consumable) OR the
  // device has an active, server-verified Premium subscription.
  const paid = query.data?.status === "paid" || premium.active;
  const snapshot = paid ? (stored?.snapshot ?? null) : null;
  const result = snapshot?.result ?? null;

  return {
    isLoading: Boolean(active) && (query.isLoading || premium.isLoading),
    unlocked: Boolean(snapshot),
    result,
    snapshot,
    market: getMarketConfig(result?.location.countryCode ?? null),
  };
}
