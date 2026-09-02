/**
 * Version-aware migration + normalisation of the persisted wizard session.
 *
 * Persisted state is untrusted: it may come from an older build, from a
 * partially written record, or from a newer build (a user who downgraded).
 * Every path ends in a state that is structurally valid for the CURRENT
 * schema — otherwise the engine could be fed a plausible-looking but stale or
 * corrupt session.
 *
 * Supported source versions:
 *   legacy (no version) -> 1 : pre-versioning sessions; cached solar data dropped
 *   1 -> 2                   : cached PVGIS resource dropped (new yield logic)
 *   2 -> 3                   : mainFuseAmp rebuilt into a ConnectionCapacity
 *   3 -> 4                   : normalisation + country revalidation on load
 *   4 -> 5                   : welcome screen gate (hasStarted)
 *   > current                : fail safe, fresh state
 */

import {
  DEFAULT_PRICE_SCENARIO,
  DEFAULT_SELF_CONSUMPTION_SHARE,
  MAX_CUSTOM_PRICE_CHANGE_PERCENT,
  MIN_CUSTOM_PRICE_CHANGE_PERCENT,
  PRICE_SCENARIO_RATES,
} from "@/config/constants";
import {
  amperageCapacity,
  isValidConnectionCapacity,
  type ConnectionCapacity,
} from "@/config/connection-capacity";
import { findConnectionOption, getConnectionConfig } from "@/config/connections";
import {
  DEFAULT_GRID_PROFILE,
  GRID_FREQUENCY_OPTIONS,
  PHASE_COUNT_FOR_SERVICE_TYPE,
  SERVICE_TYPE_FOR_PHASE_COUNT,
  SERVICE_TYPE_OPTIONS,
  type PhaseCount,
  type ServiceType,
} from "@/config/grid";
import { countryDefaults } from "@/state/country-transition";
import {
  initialWizardState,
  WIZARD_STORAGE_VERSION,
  type WizardData,
} from "@/state/wizard-initial-state";

type Loose = Record<string, unknown>;

export interface WizardMigrationOutcome {
  state: WizardData;
  /** True when the persisted state could not be used and was discarded. */
  discarded: boolean;
  /** Source version the migration started from. */
  from: number | "legacy" | "unknown";
}

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function monthly(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 12) return null;
  if (!value.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) return null;
  return value as number[];
}

/* ------------------------------------------------------------- migrations */

function toV1(state: Loose): Loose {
  // Pre-versioning sessions never carried a usable cached resource.
  return { ...state, resource: null };
}

function toV2(state: Loose): Loose {
  // New specific-yield handling: cached PVGIS data must be re-fetched.
  return { ...state, resource: null };
}

function toV3(state: Loose): Loose {
  // The ConnectionCapacity layer replaced the bare ampere value.
  let capacity = (state["connectionCapacity"] ?? null) as ConnectionCapacity | null;
  const amp = num(state["mainFuseAmp"]);
  if (!isValidConnectionCapacity(capacity) && amp && amp > 0) {
    const serviceType =
      (state["gridServiceType"] as ServiceType | undefined) ??
      SERVICE_TYPE_FOR_PHASE_COUNT[
        ((state["gridPhaseCount"] as PhaseCount | undefined) ??
          DEFAULT_GRID_PROFILE.phaseCount) as PhaseCount
      ];
    capacity = amperageCapacity(amp, {
      serviceType,
      voltageV: num(state["gridVoltageV"]) ?? DEFAULT_GRID_PROFILE.voltageV,
      lineToNeutralVoltageV: num(state["gridLineToNeutralVoltageV"]),
      frequencyHz: num(state["gridFrequencyHz"]) ?? DEFAULT_GRID_PROFILE.frequencyHz,
    });
  }
  return { ...state, connectionCapacity: capacity, resource: null };
}

function toV4(state: Loose): Loose {
  // v4 introduces explicit grid confirmation for unverified markets. An older
  // session must not inherit an implicit "confirmed".
  const countryCode = isObject(state["location"])
    ? ((state["location"] as Loose)["countryCode"] as string | undefined)
    : undefined;
  const verified = getConnectionConfig(countryCode ?? null).status === "verified";
  return { ...state, gridConfirmed: verified ? true : state["gridConfirmed"] === true };
}

function toV5(state: Loose): Loose {
  // v5 adds the welcome-screen gate. Any existing session has already passed
  // it, so returning users resume directly in the wizard instead of seeing the
  // welcome page again.
  return { ...state, hasStarted: true };
}

const MIGRATIONS: Array<(state: Loose) => Loose> = [toV1, toV2, toV3, toV4, toV5];

/* ----------------------------------------------------------- normalisation */

/**
 * Coerces a loose persisted object into a structurally valid WizardData.
 * Anything of the wrong type, non-finite, or logically impossible falls back
 * to the fresh value — the state is never half-trusted.
 */
export function normalizeWizardState(loose: Loose): WizardData {
  const base = { ...initialWizardState };

  const location = isObject(loose["location"]) ? (loose["location"] as Loose) : null;
  if (
    location &&
    typeof location["address"] === "string" &&
    num(location["latitude"]) !== null &&
    num(location["longitude"]) !== null
  ) {
    base.location = loose["location"] as WizardData["location"];
  }

  if (typeof loose["orientation"] === "string") {
    base.orientation = loose["orientation"] as WizardData["orientation"];
  }
  const tilt = num(loose["tiltDegrees"]);
  base.tiltDegrees = tilt === null ? null : Math.min(90, Math.max(0, tilt));
  base.azimuthDegrees = num(loose["azimuthDegrees"]);

  // A cached resource is only kept when it is structurally complete.
  const resource = isObject(loose["resource"]) ? (loose["resource"] as Loose) : null;
  base.resource =
    resource &&
    num(resource["annualKwhPerKwp"]) !== null &&
    (resource["annualKwhPerKwp"] as number) > 0 &&
    monthly(resource["monthlyKwhPerKwp"]) !== null
      ? (loose["resource"] as WizardData["resource"])
      : null;

  const annual = num(loose["annualConsumptionKwh"]);
  base.annualConsumptionKwh = annual !== null && annual > 0 ? annual : null;
  base.monthlyConsumptionKwh = monthly(loose["monthlyConsumptionKwh"]);
  if (typeof loose["consumptionInputType"] === "string") {
    base.consumptionInputType = loose["consumptionInputType"] as WizardData["consumptionInputType"];
  }
  if (!base.monthlyConsumptionKwh && base.consumptionInputType !== "annual-only") {
    base.consumptionInputType = "annual-only";
    base.consumptionShape = null;
  } else if (typeof loose["consumptionShape"] === "string") {
    base.consumptionShape = loose["consumptionShape"] as WizardData["consumptionShape"];
  }

  // --- grid profile --------------------------------------------------------
  const serviceType = loose["gridServiceType"];
  base.gridServiceType = SERVICE_TYPE_OPTIONS.includes(serviceType as ServiceType)
    ? (serviceType as ServiceType)
    : initialWizardState.gridServiceType;
  base.gridPhaseCount = PHASE_COUNT_FOR_SERVICE_TYPE[base.gridServiceType];
  const voltage = num(loose["gridVoltageV"]);
  base.gridVoltageV = voltage !== null && voltage > 0 ? voltage : initialWizardState.gridVoltageV;
  const lineToNeutral = num(loose["gridLineToNeutralVoltageV"]);
  base.gridLineToNeutralVoltageV =
    base.gridServiceType === "split-phase"
      ? (lineToNeutral !== null && lineToNeutral > 0 ? lineToNeutral : base.gridVoltageV / 2)
      : null;
  const frequency = num(loose["gridFrequencyHz"]);
  base.gridFrequencyHz = GRID_FREQUENCY_OPTIONS.includes(frequency ?? 0)
    ? (frequency as number)
    : initialWizardState.gridFrequencyHz;
  base.gridProfileIsUserSet = loose["gridProfileIsUserSet"] === true;
  base.gridConfirmed = loose["gridConfirmed"] === true;

  // --- connection ----------------------------------------------------------
  const capacity = (loose["connectionCapacity"] ?? null) as ConnectionCapacity | null;
  base.connectionCapacity = isValidConnectionCapacity(capacity) ? capacity : null;
  base.connectionOptionId =
    typeof loose["connectionOptionId"] === "string" ? loose["connectionOptionId"] : null;
  const source = loose["connectionSource"];
  base.connectionSource =
    source === "country-option" || source === "custom" ? source : base.connectionCapacity ? "custom" : null;
  if (!base.connectionCapacity) {
    base.connectionOptionId = null;
    base.connectionSource = null;
  }
  const fuse = num(loose["mainFuseAmp"]);
  base.mainFuseAmp =
    base.connectionCapacity?.type === "amperage"
      ? base.connectionCapacity.amperageA
      : fuse !== null && fuse > 0 && base.connectionCapacity === null
        ? null
        : null;

  // --- economics / assumptions --------------------------------------------
  const share = num(loose["selfConsumptionShare"]);
  base.selfConsumptionShare =
    share !== null && share >= 0 && share <= 1 ? share : DEFAULT_SELF_CONSUMPTION_SHARE;
  base.selfConsumptionShareIsUserSet =
    loose["selfConsumptionShareIsUserSet"] === true && share !== null && share >= 0 && share <= 1;
  const selfValue = num(loose["selfConsumedValuePerKwh"]);
  base.selfConsumedValuePerKwh = selfValue !== null && selfValue >= 0 ? selfValue : null;
  const exportValue = num(loose["exportValuePerKwh"]);
  base.exportValuePerKwh = exportValue !== null && exportValue >= 0 ? exportValue : null;
  const payback = num(loose["acceptedPaybackYears"]);
  base.acceptedPaybackYears =
    payback !== null && payback > 0 ? payback : initialWizardState.acceptedPaybackYears;
  const scenario = loose["priceScenario"];
  base.priceScenario =
    typeof scenario === "string" && (scenario === "custom" || scenario in PRICE_SCENARIO_RATES)
      ? (scenario as WizardData["priceScenario"])
      : DEFAULT_PRICE_SCENARIO;
  const custom = num(loose["customPriceChangePercent"]);
  base.customPriceChangePercent =
    custom === null
      ? initialWizardState.customPriceChangePercent
      : Math.min(MAX_CUSTOM_PRICE_CHANGE_PERCENT, Math.max(MIN_CUSTOM_PRICE_CHANGE_PERCENT, custom));
  const quote = num(loose["quotePrice"]);
  base.quotePrice = quote !== null && quote >= 0 ? quote : null;
  const step = num(loose["currentStep"]);
  base.currentStep = step !== null && step >= 1 && step <= 5 ? Math.round(step) : 1;
  base.hasStarted = loose["hasStarted"] === true;

  return base;
}

/**
 * Re-applies the country's own rules to a rehydrated session, so a state that
 * came from storage is subject to exactly the same country transition as a
 * live country change. Only country-dependent values are touched; the user's
 * own answers (roof, consumption, payback) are preserved.
 */
export function revalidateCountryDependentState(state: WizardData): WizardData {
  const countryCode = state.location?.countryCode ?? null;
  const config = getConnectionConfig(countryCode);
  const defaults = countryDefaults(countryCode);

  // A selected country option must still exist, with the same meaning.
  if (state.connectionSource === "country-option") {
    const option = state.connectionOptionId
      ? findConnectionOption(config, state.connectionOptionId)
      : null;
    if (!option) return { ...state, ...defaults };
    return {
      ...state,
      connectionCapacity: option.capacity,
      mainFuseAmp: option.capacity.type === "amperage" ? option.capacity.amperageA : null,
      gridConfirmed: config.status === "verified" ? true : state.gridConfirmed,
    };
  }

  // Unverified markets can never inherit a silent confirmation.
  if (config.status !== "verified") {
    return { ...state, gridConfirmed: false };
  }
  if (config.status === "verified" && state.connectionCapacity) {
    return { ...state, gridConfirmed: true };
  }
  return state;
}

/* ------------------------------------------------------------------ entry */

export function migrateWizardState(
  persisted: unknown,
  version: number | undefined,
): WizardMigrationOutcome {
  if (!isObject(persisted)) {
    return { state: { ...initialWizardState }, discarded: true, from: "unknown" };
  }

  // A state written by a NEWER app version cannot be interpreted safely.
  if (typeof version === "number" && version > WIZARD_STORAGE_VERSION) {
    return { state: { ...initialWizardState }, discarded: true, from: version };
  }

  const from: number | "legacy" =
    typeof version === "number" && Number.isFinite(version) && version >= 1 ? version : "legacy";
  const startIndex = from === "legacy" ? 0 : from;

  let working: Loose = persisted;
  try {
    for (let index = startIndex; index < MIGRATIONS.length; index += 1) {
      working = MIGRATIONS[index]!(working);
    }
    const normalized = revalidateCountryDependentState(normalizeWizardState(working));
    return { state: normalized, discarded: false, from };
  } catch {
    // A migration must never break the app: fall back to a safe fresh state.
    return { state: { ...initialWizardState }, discarded: true, from };
  }
}
