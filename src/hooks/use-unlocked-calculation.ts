import { useQuery } from "@tanstack/react-query";
import { getPaidCalculation } from "@/lib/purchase.functions";
import { usePurchaseStore } from "@/state/purchase-store";
import { getMarketConfig } from "@/config/markets";
import type { CalculationSnapshot } from "@/lib/calculation-snapshot";
import type { CalculationResult } from "@/lib/calc/types";

/**
 * Loads the purchased calculation from the server. Locked calculations return
 * no data at all, so the result page can never render unpaid content.
 */
export function useUnlockedCalculation(): {
  isLoading: boolean;
  unlocked: boolean;
  result: CalculationResult | null;
  snapshot: CalculationSnapshot | null;
  market: ReturnType<typeof getMarketConfig>;
} {
  const active = usePurchaseStore((s) => s.active);

  const query = useQuery({
    queryKey: ["paid-calculation", active?.id ?? null],
    enabled: Boolean(active),
    staleTime: Infinity,
    retry: 1,
    queryFn: async () =>
      getPaidCalculation({
        data: { id: active!.id, accessToken: active!.accessToken },
      }),
  });

  const snapshot = query.data?.unlocked ? (query.data.snapshot as CalculationSnapshot) : null;
  const result = snapshot?.result ?? null;

  return {
    isLoading: Boolean(active) && query.isLoading,
    unlocked: Boolean(snapshot),
    result,
    snapshot,
    market: getMarketConfig(result?.location.countryCode ?? null),
  };
}
