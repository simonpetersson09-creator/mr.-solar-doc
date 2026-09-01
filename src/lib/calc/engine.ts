import {
  CALCULATION_VERSION,
  EU_GRID_PHASES,
  EU_GRID_VOLTAGE_V,
  
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
import { calculateProductionCost } from "./production-cost";
import { buildLifetimeProjection } from "./degradation";
import { dcAcRatio, oversizingPercent } from "./inverter-sizing";
import {
  DEFAULT_GRID_FREQUENCY_HZ,
  SERVICE_TYPE_FOR_PHASE_COUNT,
  kwPerAmpForService,
  maxAcPowerKwFor,
  type PhaseCount,
} from "@/config/grid";
import { recommendArraySize } from "./solar-sizing";
import type { PvLimitBinding } from "@/config/pv-connection-rules";
import { clampShare, splitProduction, summariseSelfConsumption } from "./self-consumption";
import {
  CalculationValidationError,
  validateCalculationInput,
  validateCalculationResult,
} from "./validation";
import type {
  CalculationOutcome,
  EconomicsAvailability,
  CalculationInput,
  CalculationResult,
  RecommendationReason,
  SizingBasis,
} from "./types";

/**
 * The grid connection cannot carry even the smallest supported inverter.
 * A real-world situation, not a broken calculation: it is surfaced as its own
 * outcome so the UI can explain it instead of showing a technical error.
 */
export class GridTooSmallError extends Error {
  readonly maxAcPowerKw: number;
  readonly minimumSupportedInverterKw: number;
  constructor(maxAcPowerKw: number, minimumSupportedInverterKw: number) {
    super(
      `Grid connection ${maxAcPowerKw} kW is below the smallest supported inverter ${minimumSupportedInverterKw} kW`,
    );
    this.name = "GridTooSmallError";
    this.maxAcPowerKw = maxAcPowerKw;
    this.minimumSupportedInverterKw = minimumSupportedInverterKw;
  }
}

/**
 * Pure calculation entry point.
 * Calculation Engine -> Calculation Result -> UI / Report Service
 */
export function calculateSolarSystem(input: CalculationInput): CalculationResult {
  // Mandatory gate 1: nothing is computed from invalid or impossible input.
  const inputIssues = validateCalculationInput(input);
  if (inputIssues.length > 0) throw new CalculationValidationError(inputIssues, "input");

  const notes: string[] = [];

  // The engine consumes ONE normalised ceiling. Whether the user answered in
  // amperes, kVA or kW was resolved by the connection-capacity layer before
  // this point; nothing country- or unit-specific lives in here.
  const gridVoltageV = input.electrical.gridVoltageV ?? EU_GRID_VOLTAGE_V;
  const gridPhases = input.electrical.gridPhases ?? EU_GRID_PHASES;
  const serviceType =
    input.electrical.serviceType ??
    SERVICE_TYPE_FOR_PHASE_COUNT[(gridPhases as PhaseCount) ?? EU_GRID_PHASES];
  const mainFuseAmp = input.electrical.mainFuseAmp ?? null;
  const useLegacyFactor =
    input.electrical.gridVoltageV === undefined &&
    input.electrical.kwPerAmp !== undefined &&
    mainFuseAmp !== null;
  const kwPerAmp = useLegacyFactor
    ? input.electrical.kwPerAmp!
    : kwPerAmpForService(serviceType, gridVoltageV);
  const maxAcPowerKw =
    input.electrical.maxAcPowerKw ??
    (useLegacyFactor
      ? mainFuseAmp! * kwPerAmp
      : maxAcPowerKwFor({
          mainFuseAmp: mainFuseAmp ?? 0,
          voltageV: gridVoltageV,
          serviceType,
        }));


  // Two independent ceilings: what the connection can carry, and what the
  // country permits to connect. Sizing must respect the lower one, and the
  // binding rule is carried through so the reason shown is the real one.
  const pvRuleLimitKw = input.electrical.pvPowerLimitKw ?? null;
  const pvLimitBinding: PvLimitBinding =
    input.electrical.pvLimitBinding ??
    (pvRuleLimitKw != null && pvRuleLimitKw < maxAcPowerKw - 1e-9
      ? "pv-rule"
      : "connection-capacity");
  const acCeilingKw =
    pvRuleLimitKw != null ? Math.min(maxAcPowerKw, pvRuleLimitKw) : maxAcPowerKw;
  if (pvLimitBinding !== "connection-capacity") notes.push(`pv-limit-${pvLimitBinding}`);

  const sizing = recommendArraySize({
    desiredAnnualKwh: input.consumption.annualKwh,
    annualKwhPerKwp: input.resource.annualKwhPerKwp,
    maxAcPowerKw: acCeilingKw,
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
  // Every candidate is a whole number of panels on a real inverter, so the
  // winner is a physically buildable system.
  const panelPowerKwp = input.panelPowerKwp ?? PANEL_WATTAGE_KWP;
  const selection = selectRecommendedSystem({
    targetKwp: sizing.recommendedKwp,
    referenceKwp: sizing.referenceKwp,
    maxAcPowerKw: acCeilingKw,
    inverterSizesKw: input.inverterSizesKw,
    panelPowerKwp,
    targetRange: targetDcAcRange,
    monthlyKwhPerKwp: input.resource.monthlyKwhPerKwp,
    annualConsumptionKwh: input.consumption.annualKwh,
    monthlyConsumptionKwh: input.consumption.monthlyKwh,
    solarSeasonProductionShare,
  });
  if (selection.status === "grid-too-small") {
    throw new GridTooSmallError(
      selection.maxAcPowerKw,
      selection.minimumSupportedInverterKw,
    );
  }
  if (!selection.withinTargetRange) {
    notes.push(
      selection.targetRangeMiss === "below" ? "dc-ac-below-target" : "dc-ac-above-target",
    );
  }

  const inverterKw = selection.best.inverterKw;
  const panelCount = selection.best.panelCount;
  // Physical source of truth: panelCount x panelPowerKwp. Everything below
  // (production, economics, presentation, PDF) uses this exact value.
  const installedKwp = selection.best.installedKwp;

  let sizingBasis: SizingBasis = "consumption";
  if (sizing.limitedByGrid) {
    sizingBasis = pvLimitBinding === "connection-capacity" ? "grid-limit" : "pv-rule-limit";
  }
  if (installedKwp < sizing.recommendedKwp - 1e-9) sizingBasis = "inverter-limit";
  if (
    installedKwp <= MIN_RECOMMENDED_KWP + panelPowerKwp + 1e-9 &&
    sizing.referenceKwp < MIN_RECOMMENDED_KWP
  ) {
    sizingBasis = "minimum-size";
  }
  if (installedKwp >= MAX_RECOMMENDED_KWP - panelPowerKwp - 1e-9) sizingBasis = "maximum-size";

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
  if (sizingBasis === "grid-limit" || sizingBasis === "pv-rule-limit") {
    recommendationReason = "grid-limit";
  }
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


  // null means "unknown" and must never silently become 0. It is only mapped to
  // 0 for the internal arithmetic, and every total that depends on a missing
  // value is flagged as incomplete via `availability` below.
  const selfConsumedKnown = input.economics.selfConsumedValuePerKwh != null;
  const exportKnown = input.economics.exportValuePerKwh != null;
  const gridCompensationEnabled = input.economics.gridCompensationEnabled ?? false;
  const gridCompensationKnown =
    gridCompensationEnabled && input.economics.gridCompensationPerKwh != null;
  const installationCostKnown = input.economics.installationCostPerKwp != null;

  const availability: EconomicsAvailability = {
    selfConsumedValue: selfConsumedKnown ? "available" : "missing",
    exportValue: exportKnown ? "available" : "missing",
    installationCost: installationCostKnown ? "available" : "missing",
    gridCompensation: !gridCompensationEnabled
      ? "not-applicable"
      : gridCompensationKnown
        ? "available"
        : "missing",
    totalsComplete: selfConsumedKnown && exportKnown,
  };

  // Negative prices are rejected at the calculation layer, not only in the UI.
  const selfConsumedValuePerKwh = nonNegative(input.economics.selfConsumedValuePerKwh ?? 0);
  const exportValuePerKwh = nonNegative(input.economics.exportValuePerKwh ?? 0);

  const economics = calculateEconomicValue({
    selfConsumptionKwh: split.selfConsumptionKwh,
    exportedKwh: split.exportedKwh,
    selfConsumedValuePerKwh,
    exportValuePerKwh,
  });
  if (!availability.totalsComplete || input.economics.valuesMissing) {
    notes.push("economic-values-missing");
  }
  if (availability.selfConsumedValue === "missing") notes.push("self-consumed-value-missing");
  if (availability.exportValue === "missing") notes.push("export-value-missing");
  if (availability.installationCost === "missing") notes.push("installation-cost-missing");

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

  const investmentResult = calculateMaxInvestment(
    presentation.annualSavings,
    input.acceptedPaybackYears,
    input.quotePrice,
    lifetimeValuesScaledToPresentation,
  );

  // What the installation is estimated to cost (not what it may be worth).
  const estimatedInstallationCost =
    input.economics.installationCostPerKwp != null && installedKwp > 0
      ? input.economics.installationCostPerKwp * installedKwp
      : null;
  const quotedOrEstimatedCost = investmentResult.quotePrice ?? estimatedInstallationCost;
  const costBasis: "quote" | "installation-cost" | "none" =
    investmentResult.quotePrice != null
      ? "quote"
      : estimatedInstallationCost != null
        ? "installation-cost"
        : "none";

  const gridProfileStatus = input.electrical.gridProfileStatus ?? "verified";
  if (gridProfileStatus !== "verified") notes.push(`grid-profile-${gridProfileStatus}`);

  const result: CalculationResult = {
    location: input.location,
    resource: input.resource,
    installedKwp,
    panelCount,
    panelPowerKwp,
    sizingBasis,
    inverterKw,
    maxAcPowerKw,
    /** The grid connection's AC ceiling — a grid limit, not an inverter spec. */
    gridConnectionLimitKw: maxAcPowerKw,
    pvPowerLimitKw: acCeilingKw,
    pvLimitBinding,
    pvRulesStatus: input.electrical.pvRulesStatus ?? "generic",
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
      availability,
      gridCompensationPerKwh: gridCompensationKnown
        ? (input.economics.gridCompensationPerKwh ?? null)
        : null,
      installationCostPerKwp: input.economics.installationCostPerKwp ?? null,
    },
    mainFuseAmp: input.electrical.connection
      ? input.electrical.connection.type === "amperage"
        ? input.electrical.connection.amperageA
        : null
      : mainFuseAmp,
    connection: input.electrical.connection ?? null,
    grid: {
      voltageV: gridVoltageV,
      phases: gridPhases,
      serviceType,
      kwPerAmp,
      frequencyHz: input.electrical.gridFrequencyHz ?? DEFAULT_GRID_FREQUENCY_HZ,
      profileStatus: gridProfileStatus,
      profileConfirmed: input.electrical.gridProfileConfirmed ?? gridProfileStatus === "verified",
    },
    lifetime,
    investment: investmentResult,
    productionCost: calculateProductionCost({
      // Cost per kWh must come from what the system COSTS: the user's quote,
      // otherwise the country's installation cost per kWp. The maximum
      // justifiable investment is derived from the accepted payback time and
      // would make the cost track the user's payback slider instead of reality.
      investment: quotedOrEstimatedCost ?? 0,
      investmentFromQuote: investmentResult.quotePrice != null,
      investmentBasis: costBasis,
      totalProductionKwh: lifetime.totalProductionKwh,
      periodYears: lifetime.periodYears,
      selfConsumptionShare: split.selfConsumptionShare,
      selfConsumedValuePerKwh,
      exportValuePerKwh,
    }),
    economicsStatus: availability.totalsComplete ? "complete" : "incomplete",
    presentation,
    calculationVersion: CALCULATION_VERSION,
    calculatedAt: new Date().toISOString(),
    notes,
  };

  // Mandatory gate 2: a broken invariant must surface, never ship as a result.
  const resultIssues = validateCalculationResult(result);
  if (resultIssues.length > 0) throw new CalculationValidationError(resultIssues, "result");

  return result;
}

/**
 * Explicit, non-throwing entry point. Callers that render UI use this so an
 * invalid state produces a visible error instead of a credible-looking result.
 */
export function runCalculation(input: CalculationInput): CalculationOutcome {
  try {
    return { status: "success", result: calculateSolarSystem(input) };
  } catch (error) {
    if (error instanceof CalculationValidationError) {
      const phase = error.message.startsWith("Calculation input") ? "input" : "result";
      return { status: "validation-error", phase, issues: error.issues };
    }
    throw error;
  }
}
