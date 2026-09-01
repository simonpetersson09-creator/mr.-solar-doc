import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createSafeStorage } from "@/state/safe-storage";
import {
  initialWizardState,
  WIZARD_STORAGE_VERSION,
} from "@/state/wizard-initial-state";
import {
  migrateWizardState,
  revalidateCountryDependentState,
} from "@/state/wizard-migrations";
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
  connectionCapacityAmount,
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
  hasStarted: boolean;
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
  setStarted: (started: boolean) => void;
  reset: () => void;
}

/** The fresh session lives in wizard-initial-state so migrations can reuse it. */
const initialState = initialWizardState;

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
/**
 * Identity of a stated capacity for confirmation purposes: the input type, the
 * amount and the electrical premise behind it. Any change here means the user
 * is confirming something else than before.
 */
function capacitySignature(capacity: ConnectionCapacity | null): string {
  if (!capacity) return "none";
  return [
    capacity.type,
    connectionCapacityAmount(capacity),
    capacity.serviceType ?? "-",
    capacity.voltageV ?? "-",
    capacity.frequencyHz ?? "-",
  ].join("|");
}

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
          // Changing the stated rating invalidates an earlier confirmation.
          gridConfirmed: amp === state.mainFuseAmp ? state.gridConfirmed : false,
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
          gridConfirmed:
            capacitySignature(capacity) === capacitySignature(state.connectionCapacity)
              ? state.gridConfirmed
              : false,
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
          gridConfirmed:
            capacitySignature(capacity) === capacitySignature(state.connectionCapacity)
              ? state.gridConfirmed
              : false,
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

          // Phase model, voltage or frequency changed: whatever the user
          // confirmed earlier no longer describes the calculation premise.
          if (state.connectionSource === "country-option") {
            return {
              ...grid,
              gridProfileIsUserSet: true,
              gridConfirmed: false,
              connectionCapacity: null,
              connectionOptionId: null,
              connectionSource: null,
              mainFuseAmp: null,
            };
          }

          return {
            ...grid,
            gridProfileIsUserSet: true,
            gridConfirmed: false,
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
      setStarted: (started) => set({ hasStarted: started }),
      reset: () => set({ ...initialState }),
    }),
    {
      name: "mr-solar-doc-wizard",
      /**
       * Persisted schema version. Every step is implemented in
       * `wizard-migrations`, which also normalises and revalidates the result
       * so a rehydrated session can never be structurally invalid.
       */
      version: WIZARD_STORAGE_VERSION,
      migrate: (persisted, version) => migrateWizardState(persisted, version).state,
      /**
       * Storage is untrusted and may be unavailable: reads/writes never throw,
       * and a rehydrated session is revalidated against the current country
       * rules before it can reach the calculation engine.
       */
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        Object.assign(state, revalidateCountryDependentState(state));
      },
      storage: createJSONStorage(() => createSafeStorage("wizard")),
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
        hasStarted,
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
        hasStarted,
      }),
    },
  ),
);
