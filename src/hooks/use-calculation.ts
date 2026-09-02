import { useMemo } from "react";
import { runCalculation } from "@/lib/calc/engine";
import type { CalculationOutcome, CalculationResult } from "@/lib/calc/types";
import type { CalculationIssue } from "@/lib/calc/validation";
import { getMarketConfig } from "@/config/markets";
import { resolveEconomicsDefaults } from "@/config/countries";
import { useWizardStore } from "@/state/wizard-store";
import { PRICE_SCENARIO_RATES } from "@/config/constants";
import type { ServiceType } from "@/config/grid";
import {
  connectionCapacityToMaxAcPowerKw,
  isValidConnectionCapacity,
} from "@/config/connection-capacity";
import { getPvConnectionRules, resolvePvPowerLimit } from "@/config/pv-connection-rules";
import { getConnectionConfig } from "@/config/connections";
import { getCountryConfig } from "@/config/countries";

/** UI -> Hook -> Calculation engine -> Result. No logic lives in components. */
export function useCalculation(): {
  result: CalculationResult | null;
  /** Explicit outcome. Null while the wizard has not been answered yet. */
  outcome: CalculationOutcome | null;
  /** Broken invariants, when the engine refused to produce a result. */
  issues: CalculationIssue[];
  market: ReturnType<typeof getMarketConfig>;
} {
  const location = useWizardStore((s) => s.location);
  const resource = useWizardStore((s) => s.resource);
  const annualConsumptionKwh = useWizardStore((s) => s.annualConsumptionKwh);
  const monthlyConsumptionKwh = useWizardStore((s) => s.monthlyConsumptionKwh);
  const consumptionInputType = useWizardStore((s) => s.consumptionInputType);
  const consumptionShape = useWizardStore((s) => s.consumptionShape);
  const mainFuseAmp = useWizardStore((s) => s.mainFuseAmp);
  const connectionCapacity = useWizardStore((s) => s.connectionCapacity);
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

  const gridConfirmed = useWizardStore((s) => s.gridConfirmed);

  const outcome = useMemo<CalculationOutcome | null>(() => {
    if (!location || !resource || !annualConsumptionKwh) return null;
    if (!isValidConnectionCapacity(connectionCapacity)) return null;
    // Country config only supplies the documented kVA assumption; the
    // normalisation itself is unit-generic.
    const kvaPowerFactor = getConnectionConfig(location.countryCode).contractedKvaPowerFactor;
    const maxAcPowerKw = connectionCapacityToMaxAcPowerKw(connectionCapacity!, {
      ...(kvaPowerFactor === undefined ? {} : { contractedKvaPowerFactor: kvaPowerFactor }),
    });
    // The PV rule layer needs the physical service too: some rules are per
    // phase model (DE/AT 4.6 kVA single-phase) and the US/CA busbar rule is a
    // function of the service overcurrent rating, not of its kW capacity.
    const serviceAmperageA =
      connectionCapacity!.type === "amperage" ? connectionCapacity!.amperageA : null;
    const pvLimit = resolvePvPowerLimit({
      connectionCapacityKw: maxAcPowerKw,
      rules: getPvConnectionRules(location.countryCode),
      serviceType: gridServiceType as ServiceType,
      serviceAmperageA,
      voltageV: connectionCapacity!.voltageV ?? gridVoltageV,
    });
    return runCalculation({
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
        maxAcPowerKw,
        connection: connectionCapacity,
        serviceType: gridServiceType as ServiceType,
        gridVoltageV,
        gridPhases: gridPhaseCount,
        gridFrequencyHz,
        pvPowerLimitKw: pvLimit.maxPvAcKw,
        pvLimitBinding: pvLimit.binding,
        pvRulesStatus: pvLimit.rulesStatus,
        gridProfileStatus: getConnectionConfig(location.countryCode).status,
        gridProfileConfirmed: gridConfirmed,
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
      // No ladder is passed: the engine derives the buildable inverter
      // products from the electrical service (see @/config/inverter-catalog).
    });
  }, [
    location,
    resource,
    annualConsumptionKwh,
    monthlyConsumptionKwh,
    consumptionInputType,
    consumptionShape,
    mainFuseAmp,
    connectionCapacity,
    gridPhaseCount,
    gridServiceType,
    gridVoltageV,
    gridFrequencyHz,
    gridConfirmed,
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

  return {
    result: outcome?.status === "success" ? outcome.result : null,
    outcome,
    issues: outcome?.status === "validation-error" ? outcome.issues : [],
    market,
  };
}
