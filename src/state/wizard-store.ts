import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Orientation, SiteLocation, SolarResource } from "@/lib/calc/types";
import type { ConsumptionInputType, ConsumptionShape } from "@/lib/calc/consumption-shape";
import {
  DEFAULT_PAYBACK_YEARS,
  DEFAULT_PRICE_SCENARIO,
  DEFAULT_SELF_CONSUMPTION_SHARE,
  MAX_CUSTOM_PRICE_CHANGE_PERCENT,
  MIN_CUSTOM_PRICE_CHANGE_PERCENT,
  type PriceScenarioId,
} from "@/config/constants";
import {
  DEFAULT_GRID_PROFILE,
  PHASE_COUNT_FOR_SERVICE_TYPE,
  SERVICE_TYPE_FOR_PHASE_COUNT,
  splitPhaseLineToNeutral,
  type PhaseCount,
  type ServiceType,
} from "@/config/grid";

export interface WizardState {
  location: SiteLocation | null;
  orientation: Orientation;
  tiltDegrees: number | null;
  /** Exact compass azimuth in degrees (0=N, 90=E, 180=S, 270=W), or null. */
  azimuthDegrees: number | null;
  resource: SolarResource | null;
  annualConsumptionKwh: number | null;
  monthlyConsumptionKwh: number[] | null;
  /** Where the monthly consumption came from. */
  consumptionInputType: ConsumptionInputType;
  /** Which estimated shape the user picked (only for "annual-profile"). */
  consumptionShape: ConsumptionShape | null;
  mainFuseAmp: number | null;
  /** Grid profile: phases, voltage and frequency of the connection. */
  gridPhaseCount: PhaseCount;
  /** Electrical service type. Split-phase is its own type, not 1- or 3-phase. */
  gridServiceType: ServiceType;
  /** Reference voltage: line-to-line, except single-phase (line-to-neutral). */
  gridVoltageV: number;
  /** Line-to-neutral voltage, relevant for split-phase (e.g. 120 of 120/240). */
  gridLineToNeutralVoltageV: number | null;
  gridFrequencyHz: number;
  /** True once the user actively changed the grid profile in the UI. */
  gridProfileIsUserSet: boolean;
  selfConsumptionShare: number;
  /** True once the user actively adjusted the share, regardless of its value. */
  selfConsumptionShareIsUserSet: boolean;
  selfConsumedValuePerKwh: number | null;
  exportValuePerKwh: number | null;
  acceptedPaybackYears: number;
  /** Assumed electricity price development scenario. */
  priceScenario: PriceScenarioId;
  /** Annual change in percent used when the scenario is "custom". */
  customPriceChangePercent: number;
  quotePrice: number | null;
  /** Current wizard step (1–4). Persists across navigation so the user can
   *  return from the result page to the exact step they want to edit. */
  currentStep: number;
  setLocation: (location: SiteLocation | null) => void;
  setRoof: (
    orientation: Orientation,
    tiltDegrees: number | null,
    azimuthDegrees?: number | null,
  ) => void;
  setResource: (resource: SolarResource | null) => void;
  setConsumption: (
    annualKwh: number,
    monthlyKwh: number[] | null,
    inputType?: ConsumptionInputType,
    shape?: ConsumptionShape | null,
  ) => void;
  setMainFuse: (amp: number) => void;
  setGridProfile: (profile: {
    phaseCount?: PhaseCount;
    serviceType?: ServiceType;
    voltageV?: number;
    lineToNeutralVoltageV?: number | null;
    frequencyHz?: number;
  }) => void;
  /** Applies a country/connection default without marking it as user set. */
  setGridDefaults: (profile: {
    phaseCount?: PhaseCount;
    serviceType?: ServiceType;
    voltageV?: number;
    lineToNeutralVoltageV?: number | null;
    frequencyHz?: number;
  }) => void;
  setSelfConsumptionShare: (share: number) => void;
  setSelfConsumedValue: (value: number | null) => void;
  setExportValue: (value: number | null) => void;
  setAcceptedPaybackYears: (years: number) => void;
  setPriceScenario: (scenario: PriceScenarioId) => void;
  setCustomPriceChangePercent: (percent: number) => void;
  setQuotePrice: (price: number | null) => void;
  setCurrentStep: (step: number) => void;
  reset: () => void;
}

const initialState = {
  location: null,
  orientation: "unknown" as Orientation,
  tiltDegrees: 30,
  azimuthDegrees: null,
  resource: null,
  annualConsumptionKwh: null,
  monthlyConsumptionKwh: null,
  consumptionInputType: "annual-only" as ConsumptionInputType,
  consumptionShape: null as ConsumptionShape | null,
  mainFuseAmp: null,
  gridPhaseCount: DEFAULT_GRID_PROFILE.phaseCount,
  gridServiceType: SERVICE_TYPE_FOR_PHASE_COUNT[DEFAULT_GRID_PROFILE.phaseCount] as ServiceType,
  gridVoltageV: DEFAULT_GRID_PROFILE.voltageV,
  gridLineToNeutralVoltageV: null as number | null,
  gridFrequencyHz: DEFAULT_GRID_PROFILE.frequencyHz,
  gridProfileIsUserSet: false,
  selfConsumptionShare: DEFAULT_SELF_CONSUMPTION_SHARE,
  selfConsumptionShareIsUserSet: false,
  selfConsumedValuePerKwh: null,
  exportValuePerKwh: null,
  acceptedPaybackYears: DEFAULT_PAYBACK_YEARS,
  priceScenario: DEFAULT_PRICE_SCENARIO,
  customPriceChangePercent: 2,
  quotePrice: null,
  currentStep: 1,
};

interface GridPatch {
  phaseCount?: PhaseCount;
  serviceType?: ServiceType;
  voltageV?: number;
  lineToNeutralVoltageV?: number | null;
  frequencyHz?: number;
}

/**
 * Merges a grid patch. Service type is the source of truth; the phase count is
 * kept in sync for legacy consumers. For split-phase the line-to-neutral
 * voltage defaults to half the (line-to-line) service voltage.
 */
function mergeGrid(state: WizardState, patch: GridPatch) {
  const serviceType =
    patch.serviceType ??
    (patch.phaseCount ? SERVICE_TYPE_FOR_PHASE_COUNT[patch.phaseCount] : state.gridServiceType);
  const voltageV = patch.voltageV ?? state.gridVoltageV;
  const lineToNeutral =
    patch.lineToNeutralVoltageV !== undefined
      ? patch.lineToNeutralVoltageV
      : serviceType === "split-phase"
        ? splitPhaseLineToNeutral(voltageV)
        : null;
  return {
    gridServiceType: serviceType,
    gridPhaseCount: patch.phaseCount ?? PHASE_COUNT_FOR_SERVICE_TYPE[serviceType],
    gridVoltageV: voltageV,
    gridLineToNeutralVoltageV: lineToNeutral,
    gridFrequencyHz: patch.frequencyHz ?? state.gridFrequencyHz,
  };
}

export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      ...initialState,
      setLocation: (location) => set({ location, resource: null }),
      setRoof: (orientation, tiltDegrees, azimuthDegrees) =>
        set((state) => ({
          orientation,
          tiltDegrees:
            tiltDegrees === null || Number.isNaN(tiltDegrees)
              ? null
              : Math.min(90, Math.max(0, Math.round(tiltDegrees))),
          azimuthDegrees: azimuthDegrees === undefined ? state.azimuthDegrees : azimuthDegrees,
          resource: null,
        })),
      setResource: (resource) => set({ resource }),
      setConsumption: (annualKwh, monthlyKwh, inputType, shape) =>
        set({
          annualConsumptionKwh: annualKwh,
          monthlyConsumptionKwh: monthlyKwh,
          consumptionInputType: inputType ?? (monthlyKwh ? "monthly-manual" : "annual-only"),
          consumptionShape: shape ?? null,
        }),
      setMainFuse: (amp) => set({ mainFuseAmp: amp }),
      setGridProfile: (profile) =>
        set((state) => ({ ...mergeGrid(state, profile), gridProfileIsUserSet: true })),
      setGridDefaults: (profile) =>
        set((state) => (state.gridProfileIsUserSet ? {} : mergeGrid(state, profile))),
      setSelfConsumptionShare: (share) =>
        set({ selfConsumptionShare: share, selfConsumptionShareIsUserSet: true }),
      setSelfConsumedValue: (value) => set({ selfConsumedValuePerKwh: value }),
      setExportValue: (value) => set({ exportValuePerKwh: value }),
      setAcceptedPaybackYears: (years) => set({ acceptedPaybackYears: years }),
      setPriceScenario: (scenario) => set({ priceScenario: scenario }),
      setCustomPriceChangePercent: (percent) =>
        set({
          customPriceChangePercent: Math.min(
            MAX_CUSTOM_PRICE_CHANGE_PERCENT,
            Math.max(MIN_CUSTOM_PRICE_CHANGE_PERCENT, percent),
          ),
        }),
      setQuotePrice: (price) => set({ quotePrice: price }),
      setCurrentStep: (step) => set({ currentStep: step }),
      reset: () => set({ ...initialState }),
    }),
    {
      name: "mr-solar-doc-wizard",
      // Bump whenever cached solar/economics data may be stale.
      version: 2,
      migrate: (persisted) => ({
        ...(persisted as object),
        // Drop cached PVGIS data so it is re-fetched with current logic.
        resource: null,
      }),
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        location,
        orientation,
        tiltDegrees,
        azimuthDegrees,
        resource,
        annualConsumptionKwh,
        monthlyConsumptionKwh,
        consumptionInputType,
        consumptionShape,
        mainFuseAmp,
        gridPhaseCount,
        gridServiceType,
        gridVoltageV,
        gridLineToNeutralVoltageV,
        gridFrequencyHz,
        gridProfileIsUserSet,
        selfConsumptionShare,
        selfConsumptionShareIsUserSet,
        selfConsumedValuePerKwh,
        exportValuePerKwh,
        acceptedPaybackYears,
        priceScenario,
        customPriceChangePercent,
        currentStep,
      }) => ({
        location,
        orientation,
        tiltDegrees,
        azimuthDegrees,
        resource,
        annualConsumptionKwh,
        monthlyConsumptionKwh,
        consumptionInputType,
        consumptionShape,
        mainFuseAmp,
        gridPhaseCount,
        gridServiceType,
        gridVoltageV,
        gridLineToNeutralVoltageV,
        gridFrequencyHz,
        gridProfileIsUserSet,
        selfConsumptionShare,
        selfConsumptionShareIsUserSet,
        selfConsumedValuePerKwh,
        exportValuePerKwh,
        acceptedPaybackYears,
        priceScenario,
        customPriceChangePercent,
        currentStep,
      }),
    },
  ),
);
