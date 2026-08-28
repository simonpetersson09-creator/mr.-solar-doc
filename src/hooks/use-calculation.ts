import { useMemo } from "react";
import { calculateSolarSystem } from "@/lib/calc/engine";
import type { CalculationResult } from "@/lib/calc/types";
import { getMarketConfig } from "@/config/markets";
import { useWizardStore } from "@/state/wizard-store";

/** UI -> Hook -> Calculation engine -> Result. No logic lives in components. */
export function useCalculation(): {
  result: CalculationResult | null;
  market: ReturnType<typeof getMarketConfig>;
} {
  const location = useWizardStore((s) => s.location);
  const resource = useWizardStore((s) => s.resource);
  const annualConsumptionKwh = useWizardStore((s) => s.annualConsumptionKwh);
  const monthlyConsumptionKwh = useWizardStore((s) => s.monthlyConsumptionKwh);
  const consumptionInputType = useWizardStore((s) => s.consumptionInputType);
  const consumptionShape = useWizardStore((s) => s.consumptionShape);
  const mainFuseAmp = useWizardStore((s) => s.mainFuseAmp);
  const selfConsumptionShare = useWizardStore((s) => s.selfConsumptionShare);
  const selfConsumptionShareIsUserSet = useWizardStore((s) => s.selfConsumptionShareIsUserSet);
  const selfConsumedValuePerKwh = useWizardStore((s) => s.selfConsumedValuePerKwh);
  const exportValuePerKwh = useWizardStore((s) => s.exportValuePerKwh);
  const acceptedPaybackYears = useWizardStore((s) => s.acceptedPaybackYears);
  const quotePrice = useWizardStore((s) => s.quotePrice);

  const market = getMarketConfig(location?.countryCode);

  const result = useMemo(() => {
    if (!location || !resource || !annualConsumptionKwh || !mainFuseAmp) return null;
    return calculateSolarSystem({
      location,
      resource,
      consumption: {
        annualKwh: annualConsumptionKwh,
        monthlyKwh: monthlyConsumptionKwh,
        inputType: consumptionInputType,
        shape: consumptionShape,
        isEstimated: consumptionInputType === "annual-profile",
      },
      electrical: {
        mainFuseAmp,
        kwPerAmp: market.kwPerAmp,
        gridVoltageV: market.gridVoltageV,
        gridPhases: market.gridPhases,
      },
      economics: {
        selfConsumedValuePerKwh:
          selfConsumedValuePerKwh ?? market.selfConsumedElectricityValue ?? 0,
        exportValuePerKwh: exportValuePerKwh ?? market.exportElectricityValue ?? 0,
        currency: market.currency,
        valuesMissing:
          (selfConsumedValuePerKwh ?? market.selfConsumedElectricityValue) === null ||
          (exportValuePerKwh ?? market.exportElectricityValue) === null,
        // The source follows how the value was set, never the number itself.
        selfConsumedValueSource:
          selfConsumedValuePerKwh === null ? "standard-value" : "user-override",
        exportValueSource: exportValuePerKwh === null ? "standard-value" : "user-override",
      },
      selfConsumptionShare,
      selfConsumptionShareIsUserSet,
      acceptedPaybackYears,
      quotePrice,
      inverterSizesKw: market.inverterSizesKw,
    });
  }, [
    location,
    resource,
    annualConsumptionKwh,
    monthlyConsumptionKwh,
    consumptionInputType,
    consumptionShape,
    mainFuseAmp,
    selfConsumptionShare,
    selfConsumptionShareIsUserSet,
    selfConsumedValuePerKwh,
    exportValuePerKwh,
    acceptedPaybackYears,
    quotePrice,
    market,
  ]);

  return { result, market };
}
