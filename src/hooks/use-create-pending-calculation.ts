import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createPendingCalculation } from "@/lib/purchase.functions";
import { useCalculation } from "@/hooks/use-calculation";
import { useAppLocale } from "@/hooks/use-app-locale";
import { useWizardStore } from "@/state/wizard-store";
import { usePurchaseStore } from "@/state/purchase-store";
import { useCalculationStore } from "@/state/calculation-store";
import { PRICE_SCENARIO_RATES } from "@/config/constants";
import { SNAPSHOT_VERSION, type CalculationSnapshot } from "@/lib/calculation-snapshot";

/**
 * Stores the finished calculation locally on the device and creates the
 * server-side purchase receipt the paywall is shown for. Only the receipt
 * leaves the device — the calculation data never does.
 */
export function useCreatePendingCalculation(): () => Promise<boolean> {
  const { result } = useCalculation();
  const { locale } = useAppLocale();
  const { i18n } = useTranslation();
  const wizard = useWizardStore();
  const ensureDeviceId = usePurchaseStore((s) => s.ensureDeviceId);
  const setPending = usePurchaseStore((s) => s.setPending);
  const saveLocal = useCalculationStore((s) => s.save);

  return useCallback(async () => {
    if (!result) return false;

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

    const created = await createPendingCalculation({
      data: { deviceId: ensureDeviceId() },
    });

    saveLocal({
      id: created.id,
      accessToken: created.accessToken,
      createdAt,
      snapshot,
    });
    setPending({ id: created.id, accessToken: created.accessToken });
    return true;
  }, [result, wizard, locale, i18n.language, ensureDeviceId, setPending, saveLocal]);
}
