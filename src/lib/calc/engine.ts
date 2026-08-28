import {
  CALCULATION_VERSION,
  KWP_ROUNDING_STEP,
  MAX_RECOMMENDED_KWP,
  MIN_RECOMMENDED_KWP,
  PANEL_WATTAGE_KWP,
  SOLAR_SEASON_MONTH_INDEXES,
} from "@/config/constants";
import { analyzeConsumptionProfile, determineTargetDcAcRange } from "./consumption-profile";
import { selectRecommendedSystem } from "./candidate-selection";
import { buildPresentationValues } from "./presentation";
import { calculateEconomicValue } from "./electricity-price";
import { calculateMaxInvestment } from "./payback";
import { buildLifetimeProjection } from "./degradation";
import { maxAcPowerFromFuse, dcAcRatio, oversizingPercent } from "./inverter-sizing";
import { recommendArraySize } from "./solar-sizing";
import { splitProduction, summariseSelfConsumption } from "./self-consumption";
import { DEFAULT_SELF_CONSUMPTION_SHARE } from "@/config/constants";
import type {
  CalculationInput,
  CalculationResult,
  RecommendationReason,
  SizingBasis,
} from "./types";

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

  // Consumption + PVGIS -> profile analysis -> dynamic DC/AC target window.
  const consumptionProfile = analyzeConsumptionProfile({
    monthlyConsumptionKwh: input.consumption.monthlyKwh,
    annualConsumptionKwh: input.consumption.annualKwh,
    monthlyKwhPerKwp: input.resource.monthlyKwhPerKwp,
  });
  const targetDcAcRange = determineTargetDcAcRange(consumptionProfile.category);

  const monthlyYieldTotal = input.resource.monthlyKwhPerKwp.reduce((a, b) => a + b, 0);
  const solarSeasonProductionShare =
    monthlyYieldTotal > 0
      ? SOLAR_SEASON_MONTH_INDEXES.reduce(
          (sum, i) => sum + (input.resource.monthlyKwhPerKwp[i] ?? 0),
          0,
        ) / monthlyYieldTotal
      : 0;

  // Candidate systems -> technical constraints -> recommended system.
  const selection = selectRecommendedSystem({
    targetKwp: sizing.recommendedKwp,
    maxAcPowerKw,
    inverterSizesKw: input.inverterSizesKw,
    targetRange: targetDcAcRange,
    monthlyKwhPerKwp: input.resource.monthlyKwhPerKwp,
    annualConsumptionKwh: input.consumption.annualKwh,
    monthlyConsumptionKwh: input.consumption.monthlyKwh,
    solarSeasonProductionShare,
    kwpStep: KWP_ROUNDING_STEP,
  });
  if (!selection.withinTargetRange) notes.push("dc-ac-ratio-outside-target-window");

  const inverterKw = selection.best.inverterKw;
  const installedKwp = selection.best.installedKwp;

  let sizingBasis: SizingBasis = "consumption";
  if (sizing.limitedByGrid) sizingBasis = "grid-limit";
  if (installedKwp < sizing.recommendedKwp - 1e-9) sizingBasis = "inverter-limit";
  if (installedKwp <= MIN_RECOMMENDED_KWP + 1e-9 && sizing.referenceKwp < MIN_RECOMMENDED_KWP) {
    sizingBasis = "minimum-size";
  }
  if (installedKwp >= MAX_RECOMMENDED_KWP - 1e-9) sizingBasis = "maximum-size";

  let recommendationReason: RecommendationReason = `profile-${consumptionProfile.category}` as RecommendationReason;
  if (consumptionProfile.category === "unknown") recommendationReason = "profile-unknown";
  if (sizingBasis === "grid-limit") recommendationReason = "grid-limit";
  if (sizingBasis === "minimum-size") recommendationReason = "minimum-size";
  if (sizingBasis === "maximum-size") recommendationReason = "maximum-size";

  const monthlyProductionKwh = selection.best.monthlyProductionKwh;
  const annualProductionKwh = selection.best.annualProductionKwh;

  const split = splitProduction(annualProductionKwh, input.selfConsumptionShare);

  // No hourly model yet: anything other than the default share is a user override,
  // everything else is transparently labelled as a standard assumption.
  const selfConsumptionSummary = summariseSelfConsumption({
    split,
    annualProductionKwh,
    annualConsumptionKwh: input.consumption.annualKwh,
    source:
      Math.abs(split.selfConsumptionShare - DEFAULT_SELF_CONSUMPTION_SHARE) > 1e-9
        ? "user-override"
        : "standard-assumption",
  });

  const economics = calculateEconomicValue({
    selfConsumptionKwh: split.selfConsumptionKwh,
    exportedKwh: split.exportedKwh,
    selfConsumedValuePerKwh: input.economics.selfConsumedValuePerKwh,
    exportValuePerKwh: input.economics.exportValuePerKwh,
  });
  if (input.economics.valuesMissing) notes.push("economic-values-missing");

  if (input.resource.orientationAssumed) notes.push("orientation-assumed");
  if (input.resource.tiltAssumed) notes.push("tilt-assumed");
  if (input.consumption.monthlyKwh) {
    notes.push(
      input.consumption.isEstimated
        ? "monthly-consumption-estimated"
        : "monthly-consumption-provided",
    );
  }

  return {
    location: input.location,
    resource: input.resource,
    installedKwp,
    panelCount: Math.max(1, Math.round(installedKwp / PANEL_WATTAGE_KWP)),
    sizingBasis,
    inverterKw,
    maxAcPowerKw,
    dcAcRatio: dcAcRatio(installedKwp, inverterKw),
    oversizingPercent: oversizingPercent(installedKwp, inverterKw),
    targetDcAcRange,
    consumptionProfile,
    recommendationReason,
    monthlyProductionKwh,
    annualProductionKwh,
    consumption: input.consumption,
    selfConsumption: { share: split.selfConsumptionShare, kwh: split.selfConsumptionKwh },
    exported: { share: split.exportShare, kwh: split.exportedKwh },
    ...selfConsumptionSummary,
    economics: {
      currency: input.economics.currency,
      selfConsumedValuePerKwh: input.economics.selfConsumedValuePerKwh,
      exportValuePerKwh: input.economics.exportValuePerKwh,
      ...economics,
    },
    mainFuseAmp: input.electrical.mainFuseAmp,
    lifetime: buildLifetimeProjection({
      firstYearProductionKwh: annualProductionKwh,
      selfConsumptionShare: split.selfConsumptionShare,
      selfConsumedValuePerKwh: input.economics.selfConsumedValuePerKwh,
      exportValuePerKwh: input.economics.exportValuePerKwh,
      annualDegradationRate: input.annualDegradationRate,
    }),
    investment: calculateMaxInvestment(
      Math.round(economics.selfConsumptionValue) + Math.round(economics.exportValue),
      input.acceptedPaybackYears,
      input.quotePrice,
    ),
    presentation: buildPresentationValues({
      annualProductionKwh,
      selfConsumptionKwh: split.selfConsumptionKwh,
      selfConsumptionShare: split.selfConsumptionShare,
      annualConsumptionKwh: input.consumption.annualKwh,
      maxAcPowerKw,
      selfConsumptionValue: economics.selfConsumptionValue,
      exportValue: economics.exportValue,
    }),
    calculationVersion: CALCULATION_VERSION,
    calculatedAt: new Date().toISOString(),
    notes,
  };
}
