/**
 * Central, mandatory validation layer for the calculation engine.
 *
 * Purpose: the engine must NEVER return a normal, credible-looking result when
 * an invariant is broken. A silently wrong number is worse than a visible
 * error, so everything that could produce nonsense (NaN, Infinity, negative
 * energy, an inverter above the grid ceiling, an impossible self-consumption
 * share) is rejected here instead of being clamped away downstream.
 *
 * Two entry points, both called from `calculateSolarSystem`:
 *   validateCalculationInput()  — before any maths runs
 *   validateCalculationResult() — before the result leaves the engine
 */

import { ABSOLUTE_MAX_DC_AC_RATIO } from "@/config/constants";
import type { CalculationInput, CalculationResult } from "./types";

/** Relative tolerance used for floating point comparisons (energy balance). */
export const ENERGY_BALANCE_TOLERANCE = 1e-6;
/** Absolute kWh tolerance, so tiny arrays are not judged by relative error alone. */
export const ENERGY_BALANCE_TOLERANCE_KWH = 1e-3;
/** Small slack on the DC/AC and grid ceilings for rounding of kWp steps. */
export const RATIO_TOLERANCE = 1e-6;
/** Grid ceiling slack in kW: inverter catalogues are rounded, the grid is not. */
export const GRID_LIMIT_TOLERANCE_KW = 1e-6;

/**
 * Specific yield sanity window, kWh per kWp and year.
 *
 * Chosen deliberately wide so real geographic extremes stay possible:
 * the worst realistic European roof (badly oriented, high latitude) lands
 * around 350 kWh/kWp, while the best places on earth (Atacama, optimally
 * tilted) reach roughly 2 100 kWh/kWp. Anything outside 200–2 600 cannot be
 * physical for a fixed PV array and indicates broken or misread source data
 * (unit confusion, corrupt PVGIS response), so it is rejected rather than
 * silently used — that is how "4 000 kWh/kWp" would otherwise look normal.
 */
export const MIN_PLAUSIBLE_KWH_PER_KWP = 200;
export const MAX_PLAUSIBLE_KWH_PER_KWP = 2600;

/** Upper sanity bound for annual household consumption, kWh. */
export const MAX_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH = 1_000_000;

export type CalculationIssueCode =
  | "non-finite-value"
  | "negative-consumption"
  | "zero-consumption"
  | "implausible-consumption"
  | "invalid-solar-yield"
  | "implausible-solar-yield"
  | "invalid-monthly-profile"
  | "invalid-monthly-consumption"
  | "invalid-grid-limit"
  | "missing-inverter-sizes"
  | "invalid-self-consumption-share"
  | "negative-price"
  | "invalid-payback-years"
  | "invalid-grid-profile"
  | "unconfirmed-grid-profile"
  | "invalid-inverter-power"
  | "inverter-above-grid-limit"
  | "dc-ac-above-absolute-max"
  | "negative-energy"
  | "energy-balance-mismatch"
  | "currency-mismatch"
  | "non-finite-economics";

export interface CalculationIssue {
  code: CalculationIssueCode;
  /** Dotted path of the offending value, for logs and tests. */
  field: string;
  /** Developer-facing message. User-facing copy comes from i18n. */
  message: string;
}

export class CalculationValidationError extends Error {
  readonly issues: CalculationIssue[];
  constructor(issues: CalculationIssue[], phase: "input" | "result") {
    super(
      `Calculation ${phase} validation failed: ${issues
        .map((issue) => `${issue.field} (${issue.code})`)
        .join(", ")}`,
    );
    this.name = "CalculationValidationError";
    this.issues = issues;
  }
}

function issue(code: CalculationIssueCode, field: string, message: string): CalculationIssue {
  return { code, field, message };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Every numeric value used in critical maths must be finite. */
function requireFinite(
  issues: CalculationIssue[],
  value: unknown,
  field: string,
): value is number {
  if (finite(value)) return true;
  issues.push(issue("non-finite-value", field, `${field} must be a finite number`));
  return false;
}

function isMonthlyArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 12 && value.every((v) => finite(v));
}

/* ------------------------------------------------------------------ input */

export function validateCalculationInput(input: CalculationInput): CalculationIssue[] {
  const issues: CalculationIssue[] = [];

  // --- consumption ---------------------------------------------------------
  const annualKwh = input.consumption.annualKwh;
  if (requireFinite(issues, annualKwh, "consumption.annualKwh")) {
    if (annualKwh < 0) {
      issues.push(
        issue(
          "negative-consumption",
          "consumption.annualKwh",
          "Annual consumption cannot be negative",
        ),
      );
    } else if (annualKwh === 0) {
      // The product sizes an array from a household's use; zero use has no
      // meaningful recommendation and must be an explicit error, not a 0 kWp.
      issues.push(
        issue("zero-consumption", "consumption.annualKwh", "Annual consumption must be > 0"),
      );
    } else if (annualKwh > MAX_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH) {
      issues.push(
        issue(
          "implausible-consumption",
          "consumption.annualKwh",
          `Annual consumption above ${MAX_PLAUSIBLE_ANNUAL_CONSUMPTION_KWH} kWh is not supported`,
        ),
      );
    }
  }

  if (input.consumption.monthlyKwh !== null && input.consumption.monthlyKwh !== undefined) {
    if (!isMonthlyArray(input.consumption.monthlyKwh)) {
      issues.push(
        issue(
          "invalid-monthly-consumption",
          "consumption.monthlyKwh",
          "Monthly consumption must be exactly 12 finite values",
        ),
      );
    } else if (input.consumption.monthlyKwh.some((v) => v < 0)) {
      issues.push(
        issue(
          "invalid-monthly-consumption",
          "consumption.monthlyKwh",
          "Monthly consumption cannot contain negative values",
        ),
      );
    }
  }

  // --- solar resource ------------------------------------------------------
  const yieldPerKwp = input.resource.annualKwhPerKwp;
  if (requireFinite(issues, yieldPerKwp, "resource.annualKwhPerKwp")) {
    if (yieldPerKwp <= 0) {
      issues.push(
        issue(
          "invalid-solar-yield",
          "resource.annualKwhPerKwp",
          "Specific yield must be greater than zero",
        ),
      );
    } else if (
      yieldPerKwp < MIN_PLAUSIBLE_KWH_PER_KWP ||
      yieldPerKwp > MAX_PLAUSIBLE_KWH_PER_KWP
    ) {
      issues.push(
        issue(
          "implausible-solar-yield",
          "resource.annualKwhPerKwp",
          `Specific yield outside the physical window ${MIN_PLAUSIBLE_KWH_PER_KWP}–${MAX_PLAUSIBLE_KWH_PER_KWP} kWh/kWp`,
        ),
      );
    }
  }

  if (!isMonthlyArray(input.resource.monthlyKwhPerKwp)) {
    issues.push(
      issue(
        "invalid-monthly-profile",
        "resource.monthlyKwhPerKwp",
        "Monthly yield profile must be exactly 12 finite values",
      ),
    );
  } else if (input.resource.monthlyKwhPerKwp.some((v) => v < 0)) {
    issues.push(
      issue(
        "invalid-monthly-profile",
        "resource.monthlyKwhPerKwp",
        "Monthly yield profile cannot contain negative values",
      ),
    );
  }

  // --- electrical / grid ---------------------------------------------------
  const electrical = input.electrical;
  const maxAcPowerKw = electrical.maxAcPowerKw;
  if (maxAcPowerKw === null || maxAcPowerKw === undefined) {
    if (!finite(electrical.mainFuseAmp) || (electrical.mainFuseAmp ?? 0) <= 0) {
      issues.push(
        issue(
          "invalid-grid-limit",
          "electrical.maxAcPowerKw",
          "A finite grid connection limit above zero is required",
        ),
      );
    }
  } else if (requireFinite(issues, maxAcPowerKw, "electrical.maxAcPowerKw")) {
    if (maxAcPowerKw <= 0) {
      issues.push(
        issue(
          "invalid-grid-limit",
          "electrical.maxAcPowerKw",
          "Grid connection limit must be greater than zero",
        ),
      );
    }
  }

  if (electrical.gridVoltageV !== undefined) {
    if (requireFinite(issues, electrical.gridVoltageV, "electrical.gridVoltageV")) {
      if (electrical.gridVoltageV <= 0) {
        issues.push(
          issue("invalid-grid-profile", "electrical.gridVoltageV", "Voltage must be > 0"),
        );
      }
    }
  }
  if (electrical.gridPhases !== undefined && electrical.gridPhases !== 1 && electrical.gridPhases !== 3) {
    issues.push(
      issue("invalid-grid-profile", "electrical.gridPhases", "Phase count must be 1 or 3"),
    );
  }
  if (
    electrical.serviceType !== undefined &&
    !["single-phase", "three-phase", "split-phase"].includes(electrical.serviceType)
  ) {
    issues.push(
      issue("invalid-grid-profile", "electrical.serviceType", "Unknown electrical service type"),
    );
  }
  // Generic / unsupported country profiles may only be calculated on when the
  // user has explicitly confirmed the grid data (see step 4).
  if (
    electrical.gridProfileStatus !== undefined &&
    electrical.gridProfileStatus !== "verified" &&
    electrical.gridProfileConfirmed !== true
  ) {
    issues.push(
      issue(
        "unconfirmed-grid-profile",
        "electrical.gridProfileStatus",
        "Unverified grid profile must be confirmed by the user before calculating",
      ),
    );
  }

  // --- inverter catalogue --------------------------------------------------
  const sizes = input.inverterSizesKw;
  if (!Array.isArray(sizes) || sizes.length === 0 || !sizes.every((s) => finite(s) && s > 0)) {
    issues.push(
      issue(
        "missing-inverter-sizes",
        "inverterSizesKw",
        "At least one finite, positive inverter size is required",
      ),
    );
  }

  // --- shares and assumptions ---------------------------------------------
  const share = input.selfConsumptionShare;
  if (requireFinite(issues, share, "selfConsumptionShare")) {
    if (share < 0 || share > 1) {
      issues.push(
        issue(
          "invalid-self-consumption-share",
          "selfConsumptionShare",
          "Self-consumption share must be between 0 and 1",
        ),
      );
    }
  }

  if (requireFinite(issues, input.acceptedPaybackYears, "acceptedPaybackYears")) {
    if (input.acceptedPaybackYears <= 0) {
      issues.push(
        issue("invalid-payback-years", "acceptedPaybackYears", "Payback years must be > 0"),
      );
    }
  }

  if (input.annualDegradationRate !== undefined) {
    requireFinite(issues, input.annualDegradationRate, "annualDegradationRate");
  }
  if (input.annualPriceChangeRate !== undefined) {
    requireFinite(issues, input.annualPriceChangeRate, "annualPriceChangeRate");
  }

  // --- economics -----------------------------------------------------------
  // null means "unknown" and is allowed; a present value must be finite and
  // non-negative. Unknown values never become 0 (see availability handling).
  const priceFields: [number | null | undefined, string][] = [
    [input.economics.selfConsumedValuePerKwh, "economics.selfConsumedValuePerKwh"],
    [input.economics.exportValuePerKwh, "economics.exportValuePerKwh"],
    [input.economics.installationCostPerKwp, "economics.installationCostPerKwp"],
    [input.economics.gridCompensationPerKwh, "economics.gridCompensationPerKwh"],
  ];
  for (const [value, field] of priceFields) {
    if (value === null || value === undefined) continue;
    if (!requireFinite(issues, value, field)) continue;
    if (value < 0) issues.push(issue("negative-price", field, `${field} cannot be negative`));
  }
  if (input.quotePrice !== null && input.quotePrice !== undefined) {
    if (requireFinite(issues, input.quotePrice, "quotePrice") && input.quotePrice < 0) {
      issues.push(issue("negative-price", "quotePrice", "Quote price cannot be negative"));
    }
  }
  if (typeof input.economics.currency !== "string" || input.economics.currency.length !== 3) {
    issues.push(
      issue("currency-mismatch", "economics.currency", "Currency must be a 3-letter ISO code"),
    );
  }

  return issues;
}

/* ----------------------------------------------------------------- result */

export function validateCalculationResult(result: CalculationResult): CalculationIssue[] {
  const issues: CalculationIssue[] = [];

  // --- technical -----------------------------------------------------------
  const positives: [number, string][] = [
    [result.installedKwp, "installedKwp"],
    [result.inverterKw, "inverterKw"],
    [result.maxAcPowerKw, "maxAcPowerKw"],
    [result.gridConnectionLimitKw, "gridConnectionLimitKw"],
    [result.panelCount, "panelCount"],
    [result.dcAcRatio, "dcAcRatio"],
  ];
  for (const [value, field] of positives) {
    if (!requireFinite(issues, value, field)) continue;
    if (value <= 0) {
      issues.push(
        issue(
          field === "inverterKw" ? "invalid-inverter-power" : "negative-energy",
          field,
          `${field} must be greater than zero`,
        ),
      );
    }
  }

  if (finite(result.inverterKw) && finite(result.gridConnectionLimitKw)) {
    if (result.inverterKw > result.gridConnectionLimitKw + GRID_LIMIT_TOLERANCE_KW) {
      issues.push(
        issue(
          "inverter-above-grid-limit",
          "inverterKw",
          `Inverter ${result.inverterKw} kW exceeds the grid limit ${result.gridConnectionLimitKw} kW`,
        ),
      );
    }
  }

  if (finite(result.dcAcRatio) && result.dcAcRatio > ABSOLUTE_MAX_DC_AC_RATIO + RATIO_TOLERANCE) {
    issues.push(
      issue(
        "dc-ac-above-absolute-max",
        "dcAcRatio",
        `DC/AC ratio ${result.dcAcRatio} exceeds the absolute maximum ${ABSOLUTE_MAX_DC_AC_RATIO}`,
      ),
    );
  }

  // --- energy --------------------------------------------------------------
  const production = result.annualProductionKwh;
  const selfConsumed = result.selfConsumption.kwh;
  const exported = result.exported.kwh;
  const energyFieldsFinite =
    requireFinite(issues, production, "annualProductionKwh") &&
    requireFinite(issues, selfConsumed, "selfConsumption.kwh") &&
    requireFinite(issues, exported, "exported.kwh");

  if (!isMonthlyArray(result.monthlyProductionKwh)) {
    issues.push(
      issue(
        "invalid-monthly-profile",
        "monthlyProductionKwh",
        "Monthly production must be exactly 12 finite values",
      ),
    );
  }

  if (energyFieldsFinite) {
    if (production < 0) {
      issues.push(
        issue("negative-energy", "annualProductionKwh", "Production cannot be negative"),
      );
    }
    if (selfConsumed < 0) {
      issues.push(
        issue("negative-energy", "selfConsumption.kwh", "Self-consumption cannot be negative"),
      );
    }
    if (exported < 0) {
      issues.push(issue("negative-energy", "exported.kwh", "Export cannot be negative"));
    }
    const tolerance = Math.max(
      ENERGY_BALANCE_TOLERANCE_KWH,
      Math.abs(production) * ENERGY_BALANCE_TOLERANCE,
    );
    if (selfConsumed > production + tolerance) {
      issues.push(
        issue(
          "energy-balance-mismatch",
          "selfConsumption.kwh",
          "Self-consumption exceeds annual production",
        ),
      );
    }
    if (exported > production + tolerance) {
      issues.push(
        issue("energy-balance-mismatch", "exported.kwh", "Export exceeds annual production"),
      );
    }
    if (Math.abs(selfConsumed + exported - production) > tolerance) {
      issues.push(
        issue(
          "energy-balance-mismatch",
          "annualProductionKwh",
          "Self-consumption + export does not equal annual production",
        ),
      );
    }
  }

  const share = result.selfConsumption.share;
  if (requireFinite(issues, share, "selfConsumption.share") && (share < 0 || share > 1)) {
    issues.push(
      issue(
        "invalid-self-consumption-share",
        "selfConsumption.share",
        "Self-consumption share must be between 0 and 1",
      ),
    );
  }

  // --- economics -----------------------------------------------------------
  const economics = result.economics;
  const economicNumbers: [number, string][] = [
    [economics.selfConsumedValuePerKwh, "economics.selfConsumedValuePerKwh"],
    [economics.exportValuePerKwh, "economics.exportValuePerKwh"],
    [economics.selfConsumptionValue, "economics.selfConsumptionValue"],
    [economics.exportValue, "economics.exportValue"],
    [economics.totalValue, "economics.totalValue"],
  ];
  for (const [value, field] of economicNumbers) {
    if (!finite(value)) {
      issues.push(issue("non-finite-economics", field, `${field} must be finite`));
    }
  }

  if (economics.availability.totalsComplete) {
    // Only complete economics may produce presented totals at all.
    if (!finite(result.presentation.annualSavings)) {
      issues.push(
        issue("non-finite-economics", "presentation.annualSavings", "Annual savings not finite"),
      );
    }
    if (result.lifetime.years.some((year) => !finite(year.economicValue))) {
      issues.push(
        issue("non-finite-economics", "lifetime.years", "Lifetime economic values not finite"),
      );
    }
    if (!finite(result.investment.maxInvestmentRounded)) {
      issues.push(
        issue(
          "non-finite-economics",
          "investment.maxInvestmentRounded",
          "Maximum investment not finite",
        ),
      );
    }
  }

  if (result.economicsStatus === "complete" && !economics.availability.totalsComplete) {
    issues.push(
      issue(
        "non-finite-economics",
        "economicsStatus",
        "Economics reported complete while inputs are missing",
      ),
    );
  }

  // --- presentation --------------------------------------------------------
  const presentationNumbers: [number, string][] = [
    [result.presentation.annualProductionKwh, "presentation.annualProductionKwh"],
    [result.presentation.selfConsumptionKwh, "presentation.selfConsumptionKwh"],
    [result.presentation.exportedKwh, "presentation.exportedKwh"],
    [result.presentation.maxAcPowerKw, "presentation.maxAcPowerKw"],
  ];
  for (const [value, field] of presentationNumbers) {
    if (!finite(value) || value < 0) {
      issues.push(issue("non-finite-value", field, `${field} must be a finite, non-negative number`));
    }
  }

  return issues;
}
