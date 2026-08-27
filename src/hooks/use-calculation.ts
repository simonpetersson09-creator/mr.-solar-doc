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
  const mainFuseAmp = useWizardStore((s) => s.mainFuseAmp);
  const selfConsumptionShare = useWizardStore((s) => s.selfConsumptionShare);
  const selfConsumedValuePerKwh = useWizardStore((s) => s.selfConsumedValuePerKwh);
  const exportValuePerKwh = useWizardStore((s) => s.exportValuePerKwh);

  const market = getMarketConfig(location?.countryCode);

  const result = useMemo(() => {
    if (!location || !resource || !annualConsumptionKwh || !mainFuseAmp) return null;
    return calculateSolarSystem({
      location,
      resource,
      consumption: {
        annualKwh: annualConsumptionKwh,
        monthlyKwh: monthlyConsumptionKwh,
      },
      electrical: { mainFuseAmp, kwPerAmp: market.kwPerAmp },
      economics: {
        selfConsumedValuePerKwh:
          selfConsumedValuePerKwh ?? market.selfConsumedElectricityValue ?? 0,
        exportValuePerKwh: exportValuePerKwh ?? market.exportElectricityValue ?? 0,
        currency: market.currency,
        valuesMissing:
          (selfConsumedValuePerKwh ?? market.selfConsumedElectricityValue) === null ||
          (exportValuePerKwh ?? market.exportElectricityValue) === null,
      },
      selfConsumptionShare,
      inverterSizesKw: market.inverterSizesKw,
    });
  }, [
    location,
    resource,
    annualConsumptionKwh,
    monthlyConsumptionKwh,
    mainFuseAmp,
    selfConsumptionShare,
    selfConsumedValuePerKwh,
    exportValuePerKwh,
    market,
  ]);

  return { result, market };
}
