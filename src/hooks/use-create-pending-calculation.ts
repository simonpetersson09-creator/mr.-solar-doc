import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  claimRevision,
  startPendingCalculation,
} from "@/services/purchase-service";
import { useCalculation } from "@/hooks/use-calculation";
import { useAppLocale } from "@/hooks/use-app-locale";
import { useWizardStore } from "@/state/wizard-store";
import { usePurchaseStore } from "@/state/purchase-store";
import { useCalculationStore } from "@/state/calculation-store";
import { PRICE_SCENARIO_RATES } from "@/config/constants";
import { SNAPSHOT_VERSION, type CalculationSnapshot } from "@/lib/calculation-snapshot";
import { isDevUnlock } from "@/lib/dev-unlock";
import { fetchFreshPremium } from "@/hooks/use-premium";


/**
 * Stores the finished calculation locally on the device and creates the
 * server-side purchase receipt the paywall is shown for. Only the receipt
 * leaves the device — the calculation data never does.
 */
export interface CreateCalculationOutcome {
  ok: boolean;
  /** True when an already paid calculation was recalculated free of charge. */
  reused: boolean;
  /** Recalculations left on the reused purchase. */
  revisionsLeft: number;
  /** Server-fresh Premium entitlement at the moment of the decision. */
  premiumActive: boolean;
}

export function useCreatePendingCalculation(): () => Promise<CreateCalculationOutcome> {
  const { result } = useCalculation();
  const { locale } = useAppLocale();
  const { i18n } = useTranslation();
  const wizard = useWizardStore();
  const ensureDeviceId = usePurchaseStore((s) => s.ensureDeviceId);
  const setPending = usePurchaseStore((s) => s.setPending);
  const saveLocal = useCalculationStore((s) => s.save);
  const active = usePurchaseStore((s) => s.active);
  const rememberToken = usePurchaseStore((s) => s.rememberToken);
  const queryClient = useQueryClient();

  return useCallback(async () => {
    if (!result) return { ok: false, reused: false, revisionsLeft: 0, premiumActive: false };

    // Ask the server right now instead of trusting a cached answer: a stale
    // "not premium" would send a subscriber to the paywall and burn a free
    // recalculation.
    const premiumActive = await fetchFreshPremium(queryClient);

    const annualPriceChangeRate =
      wizard.priceScenario === "custom"
        ? wizard.customPriceChangePercent / 100
        : PRICE_SCENARIO_RATES[wizard.priceScenario];

    const createdAt = new Date().toISOString();
    const snapshot: CalculationSnapshot = {
      version: SNAPSHOT_VERSION,
      createdAt,
      language: i18n.language,
      locale,
      currency: result.economics.currency,
      result,
      assumptions: {
        orientation: wizard.orientation,
        tiltDegrees: wizard.tiltDegrees,
        azimuthDegrees: wizard.azimuthDegrees,
        annualConsumptionKwh: wizard.annualConsumptionKwh,
        monthlyConsumptionKwh: wizard.monthlyConsumptionKwh,
        consumptionInputType: wizard.consumptionInputType,
        consumptionShape: wizard.consumptionShape,
        mainFuseAmp: wizard.mainFuseAmp,
        connectionCapacity: wizard.connectionCapacity,
        selfConsumptionShare: wizard.selfConsumptionShare,
        selfConsumptionShareIsUserSet: wizard.selfConsumptionShareIsUserSet,
        selfConsumedValuePerKwh: wizard.selfConsumedValuePerKwh,
        exportValuePerKwh: wizard.exportValuePerKwh,
        acceptedPaybackYears: wizard.acceptedPaybackYears,
        priceScenario: wizard.priceScenario,
        customPriceChangePercent: wizard.customPriceChangePercent,
        annualPriceChangeRate,
        quotePrice: wizard.quotePrice,
      },
    };

    // A paid one-off calculation may be recalculated a few times within its
    // window without paying again. Premium never needs this.
    if (active && !premiumActive) {
      const claim = await claimRevision({
        data: { id: active.id, accessToken: active.accessToken },
      }).catch(() => null);
      if (claim?.granted) {
        saveLocal({
          id: active.id,
          accessToken: active.accessToken,
          createdAt,
          snapshot,
        });
        setPending(null);
        rememberToken(active);
        return { ok: true, reused: true, revisionsLeft: claim.revisionsLeft, premiumActive };
      }
    }

    // In development the purchase backend may be unavailable; fall back to a
    // local-only receipt so the result page can still be exercised.
    const created = await startPendingCalculation({
      data: { deviceId: ensureDeviceId() },
    }).catch((error: unknown) => {
      if (!isDevUnlock()) throw error;
      console.warn("[dev] createPendingCalculation failed, using local receipt", error);
      return {
        id: `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
        accessToken: "dev-local",
      };
    });


    saveLocal({
      id: created.id,
      accessToken: created.accessToken,
      createdAt,
      snapshot,
    });
    setPending({ id: created.id, accessToken: created.accessToken });
    return { ok: true, reused: false, revisionsLeft: 0, premiumActive };
  }, [
    result,
    wizard,
    locale,
    i18n.language,
    ensureDeviceId,
    setPending,
    saveLocal,
    active,
    queryClient,
    rememberToken,
  ]);
}
