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
import { countryDefaults, isSameCountry } from "@/state/country-transition";


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
  /** Id of the selected country option, when the capacity came from one. */
  connectionOptionId: string | null;
  /**
   * Where the capacity came from. A country option carries the country's own
   * verified grid profile; "custom" means the user stated it manually and the
   * manual grid profile applies.
   */
  connectionSource: "country-option" | "custom" | null;
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
  /**
   * True when the grid data may be used without further confirmation. Verified
   * countries start true; generic/unsupported ones require the user to confirm.
   */
  gridConfirmed: boolean;

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
  /**
   * Selects one of the country's own connection options. The option's grid
   * profile is authoritative and is applied together with the capacity, so a
   * "63 A" choice always means what the country says it means.
   */
  selectConnectionOption: (optionId: string, capacity: ConnectionCapacity) => void;
  /** Manually stated capacity (custom mode); uses the manual grid profile. */
  setConnectionCapacity: (capacity: ConnectionCapacity | null) => void;
  setGridConfirmed: (confirmed: boolean) => void;

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
  connectionOptionId: null as string | null,
  connectionSource: null as "country-option" | "custom" | null,
  mainFuseAmp: null,
  gridPhaseCount: DEFAULT_GRID_PROFILE.phaseCount,
  gridServiceType: SERVICE_TYPE_FOR_PHASE_COUNT[DEFAULT_GRID_PROFILE.phaseCount] as ServiceType,
  gridVoltageV: DEFAULT_GRID_PROFILE.voltageV,
  gridLineToNeutralVoltageV: null as number | null,
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
      /**
       * The ONE country transition. When the country changes, every
       * country-dependent value is revalidated centrally (see
       * `@/state/country-transition`); UI components never reset it themselves.
       */
      setLocation: (location) =>
        set((state) => {
          const changedCountry = !isSameCountry(
            state.location?.countryCode,
            location?.countryCode,
          );
          if (!changedCountry) return { location, resource: null };
          return {
            location,
            resource: null,
            ...countryDefaults(location?.countryCode ?? null),
          };
        }),

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
          connectionSource: "custom" as const,
          connectionOptionId: null,
          connectionCapacity: amperageCapacity(amp, {
            serviceType: state.gridServiceType,
            voltageV: state.gridVoltageV,
            lineToNeutralVoltageV: state.gridLineToNeutralVoltageV,
            frequencyHz: state.gridFrequencyHz,
          }),
        })),
      /**
       * A country option defines its own technical meaning. Selecting it
       * applies the option's grid profile as well, so "63 A" in Sweden is
       * always 3 x 400 V — never whatever the user last tried in the
       * advanced settings.
       */
      selectConnectionOption: (optionId, capacity) =>
        set((state) => ({
          connectionCapacity: capacity,
          connectionOptionId: optionId,
          connectionSource: "country-option" as const,
          mainFuseAmp: capacity.type === "amperage" ? capacity.amperageA : null,
          gridProfileIsUserSet: false,
          ...(capacity.serviceType && capacity.voltageV
            ? mergeGrid(state, {
                serviceType: capacity.serviceType,
                voltageV: capacity.voltageV,
                lineToNeutralVoltageV: capacity.lineToNeutralVoltageV ?? null,
                frequencyHz: capacity.frequencyHz ?? state.gridFrequencyHz,
              })
            : {}),
        })),
      /**
       * Manually stated capacity (custom mode). `mainFuseAmp` is kept in sync
       * only for ampere markets; kVA/kW markets intentionally leave it null.
       */
      setConnectionCapacity: (capacity) =>
        set((state) => ({
          connectionCapacity: capacity,
          connectionOptionId: null,
          connectionSource: capacity ? ("custom" as const) : null,
          mainFuseAmp: capacity?.type === "amperage" ? capacity.amperageA : null,
          ...(capacity && capacity.serviceType && capacity.voltageV
            ? mergeGrid(state, {
                serviceType: capacity.serviceType,
                voltageV: capacity.voltageV,
                lineToNeutralVoltageV: capacity.lineToNeutralVoltageV ?? null,
                frequencyHz: capacity.frequencyHz ?? state.gridFrequencyHz,
              })
            : {}),
        })),
      setGridConfirmed: (confirmed) => set({ gridConfirmed: confirmed }),
      /**
       * Manual expert settings. A country option's technical meaning may never
       * change silently underneath the user, so changing the grid profile
       * INVALIDATES a country-option selection: the capacity is cleared and a
       * new, explicit choice is required. A custom capacity keeps its amount
       * and is simply re-derived from the new profile.
       */
      setGridProfile: (profile) =>
        set((state) => {
          const grid = mergeGrid(state, profile);
          const unchanged =
            grid.gridServiceType === state.gridServiceType &&
            grid.gridVoltageV === state.gridVoltageV &&
            grid.gridLineToNeutralVoltageV === state.gridLineToNeutralVoltageV &&
            grid.gridFrequencyHz === state.gridFrequencyHz;
          if (unchanged) return { ...grid, gridProfileIsUserSet: true };

          if (state.connectionSource === "country-option") {
            return {
              ...grid,
              gridProfileIsUserSet: true,
              connectionCapacity: null,
              connectionOptionId: null,
              connectionSource: null,
              mainFuseAmp: null,
            };
          }

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
        connectionOptionId,
        connectionSource,
        mainFuseAmp,
        gridPhaseCount,
        gridServiceType,
        gridVoltageV,
        gridLineToNeutralVoltageV,
        gridFrequencyHz,
        gridProfileIsUserSet,
        gridConfirmed,
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
        connectionOptionId,
        connectionSource,
        mainFuseAmp,
        gridPhaseCount,
        gridServiceType,
        gridVoltageV,
        gridLineToNeutralVoltageV,
        gridFrequencyHz,
        gridProfileIsUserSet,
        gridConfirmed,
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
