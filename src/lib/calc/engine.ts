import { CALCULATION_VERSION } from "@/config/constants";
import { calculateEconomicValue } from "./electricity-price";
import { annualProduction, monthlyProduction } from "./energy-production";
import { maxAcPowerFromFuse, dcAcRatio, oversizingPercent, recommendInverter } from "./inverter-sizing";
import { recommendArraySize, clampKwp, roundKwp } from "./solar-sizing";
import { splitProduction } from "./self-consumption";
import type { CalculationInput, CalculationResult } from "./types";

/**
 * Pure calculation entry point.
 * Calculation Engine -> Calculation Result -> UI / Report Service
 */
export function calculateSolarSystem(input: CalculationInput): CalculationResult {
  const notes: string[] = [];

  const maxAcPowerKw = maxAcPowerFromFuse(
    input.electrical.mainFuseAmp,
    input.electrical.kwPerAmp,
  );

  const sizing = recommendArraySize({
    desiredAnnualKwh: input.consumption.annualKwh,
    annualKwhPerKwp: input.resource.annualKwhPerKwp,
    maxAcPowerKw,
  });
  if (sizing.limitedByGrid) notes.push("limited-by-main-fuse");

  const { inverterKw, withinTargetWindow } = recommendInverter({
    installedKwp: sizing.recommendedKwp,
    maxAcPowerKw,
    inverterSizesKw: input.inverterSizesKw,
  });
  if (!withinTargetWindow) notes.push("dc-ac-ratio-outside-target-window");

  // Never let the array exceed what the chosen inverter may carry.
  const installedKwp = clampKwp(
    roundKwp(Math.min(sizing.recommendedKwp, inverterKw * 1.3)),
  );

  const monthlyProductionKwh = monthlyProduction(input.resource.monthlyKwhPerKwp, installedKwp);
  const annualProductionKwh = annualProduction(monthlyProductionKwh);

  const split = splitProduction(annualProductionKwh, input.selfConsumptionShare);

  const economics = calculateEconomicValue({
    selfConsumptionKwh: split.selfConsumptionKwh,
    exportedKwh: split.exportedKwh,
    selfConsumedValuePerKwh: input.economics.selfConsumedValuePerKwh,
    exportValuePerKwh: input.economics.exportValuePerKwh,
  });
  if (input.economics.valuesMissing) notes.push("economic-values-missing");

  if (input.resource.orientationAssumed) notes.push("orientation-assumed");
  if (input.resource.tiltAssumed) notes.push("tilt-assumed");
  if (input.consumption.monthlyKwh) notes.push("monthly-consumption-provided");

  return {
    location: input.location,
    resource: input.resource,
    installedKwp,
    inverterKw,
    maxAcPowerKw,
    dcAcRatio: dcAcRatio(installedKwp, inverterKw),
    oversizingPercent: oversizingPercent(installedKwp, inverterKw),
    monthlyProductionKwh,
    annualProductionKwh,
    consumption: input.consumption,
    selfConsumption: { share: split.selfConsumptionShare, kwh: split.selfConsumptionKwh },
    exported: { share: split.exportShare, kwh: split.exportedKwh },
    economics: {
      currency: input.economics.currency,
      selfConsumedValuePerKwh: input.economics.selfConsumedValuePerKwh,
      exportValuePerKwh: input.economics.exportValuePerKwh,
      ...economics,
    },
    mainFuseAmp: input.electrical.mainFuseAmp,
    calculationVersion: CALCULATION_VERSION,
    calculatedAt: new Date().toISOString(),
    notes,
  };
}
