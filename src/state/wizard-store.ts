import { create } from "zustand";
import type { Orientation, SiteLocation, SolarResource } from "@/lib/calc/types";
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
  mainFuseAmp: number | null;
  selfConsumptionShare: number;
  selfConsumedValuePerKwh: number | null;
  exportValuePerKwh: number | null;
  acceptedPaybackYears: number;
  setLocation: (location: SiteLocation | null) => void;
  setRoof: (
    orientation: Orientation,
    tiltDegrees: number | null,
    azimuthDegrees?: number | null,
  ) => void;
  setResource: (resource: SolarResource | null) => void;
  setConsumption: (annualKwh: number, monthlyKwh: number[] | null) => void;
  setMainFuse: (amp: number) => void;
  setSelfConsumptionShare: (share: number) => void;
  setSelfConsumedValue: (value: number) => void;
  setExportValue: (value: number) => void;
  setAcceptedPaybackYears: (years: number) => void;
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
  mainFuseAmp: null,
  selfConsumptionShare: DEFAULT_SELF_CONSUMPTION_SHARE,
  selfConsumedValuePerKwh: null,
  exportValuePerKwh: null,
  acceptedPaybackYears: DEFAULT_PAYBACK_YEARS,
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
  setConsumption: (annualKwh, monthlyKwh) =>
    set({ annualConsumptionKwh: annualKwh, monthlyConsumptionKwh: monthlyKwh }),
  setMainFuse: (amp) => set({ mainFuseAmp: amp }),
  setSelfConsumptionShare: (share) => set({ selfConsumptionShare: share }),
  setSelfConsumedValue: (value) => set({ selfConsumedValuePerKwh: value }),
  setExportValue: (value) => set({ exportValuePerKwh: value }),
  setAcceptedPaybackYears: (years) => set({ acceptedPaybackYears: years }),
  reset: () => set({ ...initialState }),
}));
