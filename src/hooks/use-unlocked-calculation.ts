import { useQuery } from "@tanstack/react-query";
import { getPurchaseStatus } from "@/lib/purchase.functions";
import { usePurchaseStore } from "@/state/purchase-store";
import { usePremium } from "@/hooks/use-premium";
import { useCalculationStore } from "@/state/calculation-store";
import { getMarketConfig } from "@/config/markets";
import { isDevUnlock } from "@/lib/dev-unlock";
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
  /** Free recalculations left on this one-off purchase (0 for Premium). */
  revisionsLeft: number;
  market: ReturnType<typeof getMarketConfig>;
} {
  const active = usePurchaseStore((s) => s.active);
  const items = useCalculationStore((s) => s.items);
  const devUnlock = isDevUnlock();
  // In development, fall back to the most recent locally stored calculation so
  // the result page and PDF can be exercised without a purchase receipt.
  const stored = active
    ? (items[active.id] ?? null)
    : devUnlock
      ? (Object.values(items).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null)
      : null;

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
  // Unlocked when the calculation itself is paid (one-off consumable), the
  // device has an active, server-verified Premium subscription, or the dev
  // bypass is active (local development only).
  const paid = devUnlock || query.data?.status === "paid" || premium.active;
  const snapshot = paid ? (stored?.snapshot ?? null) : null;
  const result = snapshot?.result ?? null;

  return {
    isLoading: !devUnlock && Boolean(active) && (query.isLoading || premium.isLoading),
    unlocked: Boolean(snapshot),
    result,
    snapshot,
    revisionsLeft: premium.active ? 0 : (query.data?.revisionsLeft ?? 0),
    market: getMarketConfig(result?.location.countryCode ?? null),
  };
}
