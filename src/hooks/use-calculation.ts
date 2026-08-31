import { useMemo } from "react";
import { calculateSolarSystem } from "@/lib/calc/engine";
import type { CalculationResult } from "@/lib/calc/types";
import { getMarketConfig } from "@/config/markets";
import { resolveEconomicsDefaults } from "@/config/countries";
import { useWizardStore } from "@/state/wizard-store";
import { PRICE_SCENARIO_RATES } from "@/config/constants";
import type { ServiceType } from "@/config/grid";
import { getCountryConfig } from "@/config/countries";

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
  const gridPhaseCount = useWizardStore((s) => s.gridPhaseCount);
  const gridServiceType = useWizardStore((s) => s.gridServiceType);
  const gridVoltageV = useWizardStore((s) => s.gridVoltageV);
  const gridFrequencyHz = useWizardStore((s) => s.gridFrequencyHz);
  const selfConsumptionShare = useWizardStore((s) => s.selfConsumptionShare);
  const selfConsumptionShareIsUserSet = useWizardStore((s) => s.selfConsumptionShareIsUserSet);
  const selfConsumedValuePerKwh = useWizardStore((s) => s.selfConsumedValuePerKwh);
  const exportValuePerKwh = useWizardStore((s) => s.exportValuePerKwh);
  const acceptedPaybackYears = useWizardStore((s) => s.acceptedPaybackYears);
  const quotePrice = useWizardStore((s) => s.quotePrice);
  const priceScenario = useWizardStore((s) => s.priceScenario);
  const customPriceChangePercent = useWizardStore((s) => s.customPriceChangePercent);

  const annualPriceChangeRate =
    priceScenario === "custom"
      ? customPriceChangePercent / 100
      : PRICE_SCENARIO_RATES[priceScenario];

  const market = getMarketConfig(location?.countryCode);
  const economicsDefaults = resolveEconomicsDefaults(location?.countryCode, {
    selfConsumedValuePerKwh,
    exportValuePerKwh,
  });

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
        serviceType: gridServiceType as ServiceType,
        gridVoltageV,
        gridPhases: gridPhaseCount,
        gridFrequencyHz,
      },
      economics: {
        // Country decides the standard values; the user's own values always win.
        // null stays null: unknown values must not be presented as zero.
        selfConsumedValuePerKwh: economicsDefaults.selfConsumedValuePerKwh,
        exportValuePerKwh: economicsDefaults.exportValuePerKwh,
        installationCostPerKwp: economicsDefaults.installationCostPerKwp,
        gridCompensationPerKwh: economicsDefaults.gridCompensationPerKwh,
        gridCompensationEnabled: getCountryConfig(location?.countryCode).economics
          .gridCompensation.enabled,
        currency: economicsDefaults.currencyCode,
        valuesMissing: economicsDefaults.valuesMissing,
        // The source follows how the value was set, never the number itself.
        selfConsumedValueSource:
          selfConsumedValuePerKwh === null ? "standard-value" : "user-override",
        exportValueSource: exportValuePerKwh === null ? "standard-value" : "user-override",
      },
      selfConsumptionShare,
      selfConsumptionShareIsUserSet,
      acceptedPaybackYears,
      annualPriceChangeRate,
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
    gridPhaseCount,
    gridServiceType,
    gridVoltageV,
    gridFrequencyHz,
    selfConsumptionShare,
    selfConsumptionShareIsUserSet,
    selfConsumedValuePerKwh,
    exportValuePerKwh,
    acceptedPaybackYears,
    annualPriceChangeRate,
    quotePrice,
    market,
    economicsDefaults,
  ]);

  return { result, market };
}
