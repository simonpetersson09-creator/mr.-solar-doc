import { create } from "zustand";
import type { Orientation, SiteLocation, SolarResource } from "@/lib/calc/types";
import type { ConsumptionInputType, ConsumptionShape } from "@/lib/calc/consumption-shape";
import { DEFAULT_PAYBACK_YEARS, DEFAULT_SELF_CONSUMPTION_SHARE } from "@/config/constants";

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
  selfConsumptionShare: number;
  selfConsumedValuePerKwh: number | null;
  exportValuePerKwh: number | null;
  acceptedPaybackYears: number;
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
  setSelfConsumptionShare: (share: number) => void;
  setSelfConsumedValue: (value: number) => void;
  setExportValue: (value: number) => void;
  setAcceptedPaybackYears: (years: number) => void;
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
  selfConsumptionShare: DEFAULT_SELF_CONSUMPTION_SHARE,
  selfConsumedValuePerKwh: null,
  exportValuePerKwh: null,
  acceptedPaybackYears: DEFAULT_PAYBACK_YEARS,
  quotePrice: null,
  currentStep: 1,
};

export const useWizardStore = create<WizardState>((set) => ({
  ...initialState,
  setLocation: (location) => set({ location, resource: null }),
  setRoof: (orientation, tiltDegrees, azimuthDegrees) =>
    set((state) => ({
      orientation,
      tiltDegrees,
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
  setSelfConsumptionShare: (share) => set({ selfConsumptionShare: share }),
  setSelfConsumedValue: (value) => set({ selfConsumedValuePerKwh: value }),
  setExportValue: (value) => set({ exportValuePerKwh: value }),
  setAcceptedPaybackYears: (years) => set({ acceptedPaybackYears: years }),
  setQuotePrice: (price) => set({ quotePrice: price }),
  setCurrentStep: (step) => set({ currentStep: step }),
  reset: () => set({ ...initialState }),
}));
