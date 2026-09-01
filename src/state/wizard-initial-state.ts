/**
 * The wizard's fresh state and its persisted schema version.
 *
 * Lives in its own module so both the store and the migration layer can use it
 * without a circular import: a failed or unknown migration must always be able
 * to fall back to exactly this state.
 */

import type { Orientation, SiteLocation, SolarResource } from "@/lib/calc/types";
import type { ConsumptionInputType, ConsumptionShape } from "@/lib/calc/consumption-shape";
import {
  DEFAULT_PAYBACK_YEARS,
  DEFAULT_PRICE_SCENARIO,
  DEFAULT_SELF_CONSUMPTION_SHARE,
  type PriceScenarioId,
} from "@/config/constants";
import { DEFAULT_GRID_PROFILE, SERVICE_TYPE_FOR_PHASE_COUNT, type PhaseCount, type ServiceType } from "@/config/grid";
import type { ConnectionCapacity } from "@/config/connection-capacity";

/**
 * Persisted schema version. Bump whenever the shape or the meaning of a
 * persisted field changes, and add the matching step in `wizard-migrations`.
 */
export const WIZARD_STORAGE_VERSION = 5;

export interface WizardData {
  location: SiteLocation | null;
  orientation: Orientation;
  tiltDegrees: number | null;
  azimuthDegrees: number | null;
  resource: SolarResource | null;
  annualConsumptionKwh: number | null;
  monthlyConsumptionKwh: number[] | null;
  consumptionInputType: ConsumptionInputType;
  consumptionShape: ConsumptionShape | null;
  connectionCapacity: ConnectionCapacity | null;
  connectionOptionId: string | null;
  connectionSource: "country-option" | "custom" | null;
  mainFuseAmp: number | null;
  gridPhaseCount: PhaseCount;
  gridServiceType: ServiceType;
  gridVoltageV: number;
  gridLineToNeutralVoltageV: number | null;
  gridFrequencyHz: number;
  gridProfileIsUserSet: boolean;
  gridConfirmed: boolean;
  selfConsumptionShare: number;
  selfConsumptionShareIsUserSet: boolean;
  selfConsumedValuePerKwh: number | null;
  exportValuePerKwh: number | null;
  acceptedPaybackYears: number;
  priceScenario: PriceScenarioId;
  customPriceChangePercent: number;
  quotePrice: number | null;
  currentStep: number;
  /** True once the user has passed the welcome screen and entered the wizard. */
  hasStarted: boolean;
}

export const initialWizardState: WizardData = {
  location: null,
  orientation: "unknown",
  tiltDegrees: 30,
  azimuthDegrees: null,
  resource: null,
  annualConsumptionKwh: null,
  monthlyConsumptionKwh: null,
  consumptionInputType: "annual-only",
  consumptionShape: null,
  connectionCapacity: null,
  connectionOptionId: null,
  connectionSource: null,
  mainFuseAmp: null,
  gridPhaseCount: DEFAULT_GRID_PROFILE.phaseCount,
  gridServiceType: SERVICE_TYPE_FOR_PHASE_COUNT[DEFAULT_GRID_PROFILE.phaseCount],
  gridVoltageV: DEFAULT_GRID_PROFILE.voltageV,
  gridLineToNeutralVoltageV: null,
  gridFrequencyHz: DEFAULT_GRID_PROFILE.frequencyHz,
  gridProfileIsUserSet: false,
  gridConfirmed: false,
  selfConsumptionShare: DEFAULT_SELF_CONSUMPTION_SHARE,
  selfConsumptionShareIsUserSet: false,
  selfConsumedValuePerKwh: null,
  exportValuePerKwh: null,
  acceptedPaybackYears: DEFAULT_PAYBACK_YEARS,
  priceScenario: DEFAULT_PRICE_SCENARIO,
  customPriceChangePercent: 2,
  quotePrice: null,
  currentStep: 1,
  hasStarted: false,
};
