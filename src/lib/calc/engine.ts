import {
  CALCULATION_VERSION,
  EU_GRID_PHASES,
  EU_GRID_VOLTAGE_V,
  KWP_ROUNDING_STEP,
  MAX_RECOMMENDED_KWP,
  MIN_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH,
  MIN_RECOMMENDED_KWP,
  MINIMUM_SIZE_NOTE_FACTOR,
  PANEL_WATTAGE_KWP,
  SOLAR_SEASON_MONTH_INDEXES,
} from "@/config/constants";
import { analyzeConsumptionProfile, determineTargetDcAcRange } from "./consumption-profile";
import { selectRecommendedSystem } from "./candidate-selection";
import { buildPresentationValues } from "./presentation";
import { calculateEconomicValue, nonNegative } from "./electricity-price";
import { calculateMaxInvestment } from "./payback";
import { buildLifetimeProjection } from "./degradation";
import { maxAcPowerFromFuse, dcAcRatio, oversizingPercent } from "./inverter-sizing";
import { recommendArraySize } from "./solar-sizing";
import { clampShare, splitProduction, summariseSelfConsumption } from "./self-consumption";
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
  if (!selection.withinTargetRange) {
    notes.push(
      selection.targetRangeMiss === "below" ? "dc-ac-below-target" : "dc-ac-above-target",
    );
  }

  const inverterKw = selection.best.inverterKw;
  const installedKwp = selection.best.installedKwp;

  let sizingBasis: SizingBasis = "consumption";
  if (sizing.limitedByGrid) sizingBasis = "grid-limit";
  if (installedKwp < sizing.recommendedKwp - 1e-9) sizingBasis = "inverter-limit";
  if (installedKwp <= MIN_RECOMMENDED_KWP + 1e-9 && sizing.referenceKwp < MIN_RECOMMENDED_KWP) {
    sizingBasis = "minimum-size";
  }
  if (installedKwp >= MAX_RECOMMENDED_KWP - 1e-9) sizingBasis = "maximum-size";

  // The smallest commercially available inverters set a practical floor, so a
  // very small target can only be met by a noticeably larger array.
  if (installedKwp > sizing.recommendedKwp * MINIMUM_SIZE_NOTE_FACTOR + 1e-9) {
    notes.push("minimum-system-size");
  }
  if (input.consumption.annualKwh < MIN_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH) {
    notes.push("consumption-below-minimum");
  }


  let recommendationReason: RecommendationReason = `profile-${consumptionProfile.category}` as RecommendationReason;
  if (consumptionProfile.category === "unknown") recommendationReason = "profile-unknown";
  if (sizingBasis === "grid-limit") recommendationReason = "grid-limit";
  if (sizingBasis === "minimum-size") recommendationReason = "minimum-size";
  if (sizingBasis === "maximum-size") recommendationReason = "maximum-size";

  const monthlyProductionKwh = selection.best.monthlyProductionKwh;
  const annualProductionKwh = selection.best.annualProductionKwh;

  // Self-consumption is capped by what the household actually uses, so the
  // energy amount — not just the displayed percentage — stays physical.
  const split = splitProduction(
    annualProductionKwh,
    input.selfConsumptionShare,
    input.consumption.annualKwh,
  );

  // No hourly model yet. The source follows how the value was set, never the
  // number itself: picking exactly the default share manually is still an override.
  const selfConsumptionSummary = summariseSelfConsumption({
    split,
    annualProductionKwh,
    annualConsumptionKwh: input.consumption.annualKwh,
    source: input.selfConsumptionShareIsUserSet ? "user-override" : "standard-assumption",
  });


  // Negative prices are rejected at the calculation layer, not only in the UI.
  const selfConsumedValuePerKwh = nonNegative(input.economics.selfConsumedValuePerKwh);
  const exportValuePerKwh = nonNegative(input.economics.exportValuePerKwh);

  const economics = calculateEconomicValue({
    selfConsumptionKwh: split.selfConsumptionKwh,
    exportedKwh: split.exportedKwh,
    selfConsumedValuePerKwh,
    exportValuePerKwh,
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

  // Single source of truth for every presented economic figure: UI, the
  // investment level and the PDF all read these same rounded values.
  const presentation = buildPresentationValues({
    annualProductionKwh,
    selfConsumptionKwh: split.selfConsumptionKwh,
    selfConsumptionShare: split.selfConsumptionShare,
    requestedSelfConsumptionShare: clampShare(input.selfConsumptionShare),
    annualConsumptionKwh: input.consumption.annualKwh,
    maxAcPowerKw,
    selfConsumptionValue: economics.selfConsumptionValue,
    exportValue: economics.exportValue,
  });

  // Year-by-year economics (degradation + electricity price scenario).
  const lifetime = buildLifetimeProjection({
    firstYearProductionKwh: annualProductionKwh,
    selfConsumptionShare: input.selfConsumptionShare,
    annualConsumptionKwh: input.consumption.annualKwh,
    selfConsumedValuePerKwh,
    exportValuePerKwh,
    annualDegradationRate: input.annualDegradationRate,
    annualPriceChangeRate: input.annualPriceChangeRate,
  });

  // Keep the investment level consistent with the presented year-1 savings.
  const firstYearValue = lifetime.years[0]?.economicValue ?? 0;
  const valueScale = firstYearValue > 0 ? presentation.annualSavings / firstYearValue : 1;
  const lifetimeValuesScaledToPresentation = lifetime.years.map(
    (year) => year.economicValue * valueScale,
  );

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
      selfConsumedValuePerKwh,
      exportValuePerKwh,
      ...economics,
      selfConsumedValueSource: input.economics.selfConsumedValueSource ?? "standard-value",
      exportValueSource: input.economics.exportValueSource ?? "standard-value",
    },
    mainFuseAmp: input.electrical.mainFuseAmp,
    grid: {
      voltageV: input.electrical.gridVoltageV ?? EU_GRID_VOLTAGE_V,
      phases: input.electrical.gridPhases ?? EU_GRID_PHASES,
      kwPerAmp: input.electrical.kwPerAmp,
    },
    lifetime,
    investment: calculateMaxInvestment(
      presentation.annualSavings,
      input.acceptedPaybackYears,
      input.quotePrice,
      lifetimeValuesScaledToPresentation,
    ),
    presentation,
    calculationVersion: CALCULATION_VERSION,
    calculatedAt: new Date().toISOString(),
    notes,
  };
}
