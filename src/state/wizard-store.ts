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
import {
  amperageCapacity,
  isValidConnectionCapacity,
  type ConnectionCapacity,
} from "@/config/connection-capacity";

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
  /**
   * What the user stated as their electrical connection, in the unit their
   * country uses. Source of truth for the AC ceiling.
   */
  connectionCapacity: ConnectionCapacity | null;
  /** Amperes when the connection is stated in amperes, otherwise null. */
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
  setConnectionCapacity: (capacity: ConnectionCapacity | null) => void;
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
  connectionCapacity: null as ConnectionCapacity | null,
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
      setMainFuse: (amp) =>
        set((state) => ({
          mainFuseAmp: amp,
          connectionCapacity: amperageCapacity(amp, {
            serviceType: state.gridServiceType,
            voltageV: state.gridVoltageV,
            lineToNeutralVoltageV: state.gridLineToNeutralVoltageV,
            frequencyHz: state.gridFrequencyHz,
          }),
        })),
      /**
       * Capacity is the source of truth. `mainFuseAmp` is kept in sync only
       * for ampere markets; kVA/kW markets intentionally leave it null.
       */
      setConnectionCapacity: (capacity) =>
        set((state) => ({
          connectionCapacity: capacity,
          mainFuseAmp: capacity?.type === "amperage" ? capacity.amperageA : null,
          ...(capacity && capacity.serviceType
            ? mergeGrid(state, {
                serviceType: capacity.serviceType,
                voltageV: capacity.voltageV,
                lineToNeutralVoltageV: capacity.lineToNeutralVoltageV ?? null,
                frequencyHz: capacity.frequencyHz,
              })
            : {}),
        })),
      setGridProfile: (profile) =>
        set((state) => {
          const grid = mergeGrid(state, profile);
          return {
            ...grid,
            gridProfileIsUserSet: true,
            connectionCapacity:
              state.connectionCapacity?.type === "amperage"
                ? amperageCapacity(state.connectionCapacity.amperageA, {
                    serviceType: grid.gridServiceType,
                    voltageV: grid.gridVoltageV,
                    lineToNeutralVoltageV: grid.gridLineToNeutralVoltageV,
                    frequencyHz: grid.gridFrequencyHz,
                  })
                : state.connectionCapacity,
          };
        }),
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
      version: 3,
      /**
       * v2 -> v3: sessions saved before the ConnectionCapacity layer only have
       * `mainFuseAmp` plus the grid profile. They are rebuilt into an
       * equivalent amperage capacity, so an existing Swedish session keeps
       * exactly the same grid profile, ceiling and result.
       */
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<WizardState>;
        let connectionCapacity = state.connectionCapacity ?? null;
        if (!isValidConnectionCapacity(connectionCapacity) && state.mainFuseAmp) {
          connectionCapacity = amperageCapacity(state.mainFuseAmp, {
            serviceType:
              state.gridServiceType ??
              SERVICE_TYPE_FOR_PHASE_COUNT[
                state.gridPhaseCount ?? DEFAULT_GRID_PROFILE.phaseCount
              ],
            voltageV: state.gridVoltageV ?? DEFAULT_GRID_PROFILE.voltageV,
            lineToNeutralVoltageV: state.gridLineToNeutralVoltageV ?? null,
            frequencyHz: state.gridFrequencyHz ?? DEFAULT_GRID_PROFILE.frequencyHz,
          });
        }
        return {
          ...state,
          connectionCapacity,
          // Drop cached PVGIS data so it is re-fetched with current logic.
          resource: null,
        };
      },
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
        connectionCapacity,
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
        connectionCapacity,
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
