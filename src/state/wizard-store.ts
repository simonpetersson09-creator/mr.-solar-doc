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
  type PhaseCount,
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
  gridVoltageV: number;
  gridFrequencyHz: number;
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
    voltageV?: number;
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
  gridVoltageV: DEFAULT_GRID_PROFILE.voltageV,
  gridFrequencyHz: DEFAULT_GRID_PROFILE.frequencyHz,
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
        set((state) => ({
          gridPhaseCount: profile.phaseCount ?? state.gridPhaseCount,
          gridVoltageV: profile.voltageV ?? state.gridVoltageV,
          gridFrequencyHz: profile.frequencyHz ?? state.gridFrequencyHz,
        })),
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
        gridVoltageV,
        gridFrequencyHz,
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
        gridVoltageV,
        gridFrequencyHz,
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
