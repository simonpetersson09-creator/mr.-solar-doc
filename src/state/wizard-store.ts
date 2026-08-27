import { create } from "zustand";
import type { Orientation, SiteLocation, SolarResource } from "@/lib/calc/types";
import { DEFAULT_SELF_CONSUMPTION_SHARE } from "@/config/constants";

export interface WizardState {
  location: SiteLocation | null;
  orientation: Orientation;
  tiltDegrees: number | null;
  resource: SolarResource | null;
  annualConsumptionKwh: number | null;
  monthlyConsumptionKwh: number[] | null;
  mainFuseAmp: number | null;
  selfConsumptionShare: number;
  selfConsumedValuePerKwh: number | null;
  exportValuePerKwh: number | null;
  setLocation: (location: SiteLocation | null) => void;
  setRoof: (orientation: Orientation, tiltDegrees: number | null) => void;
  setResource: (resource: SolarResource | null) => void;
  setConsumption: (annualKwh: number, monthlyKwh: number[] | null) => void;
  setMainFuse: (amp: number) => void;
  setSelfConsumptionShare: (share: number) => void;
  setSelfConsumedValue: (value: number) => void;
  setExportValue: (value: number) => void;
  reset: () => void;
}

const initialState = {
  location: null,
  orientation: "unknown" as Orientation,
  tiltDegrees: null,
  resource: null,
  annualConsumptionKwh: null,
  monthlyConsumptionKwh: null,
  mainFuseAmp: null,
  selfConsumptionShare: DEFAULT_SELF_CONSUMPTION_SHARE,
  selfConsumedValuePerKwh: null,
  exportValuePerKwh: null,
};

export const useWizardStore = create<WizardState>((set) => ({
  ...initialState,
  setLocation: (location) => set({ location, resource: null }),
  setRoof: (orientation, tiltDegrees) => set({ orientation, tiltDegrees, resource: null }),
  setResource: (resource) => set({ resource }),
  setConsumption: (annualKwh, monthlyKwh) =>
    set({ annualConsumptionKwh: annualKwh, monthlyConsumptionKwh: monthlyKwh }),
  setMainFuse: (amp) => set({ mainFuseAmp: amp }),
  setSelfConsumptionShare: (share) => set({ selfConsumptionShare: share }),
  setSelfConsumedValue: (value) => set({ selfConsumedValuePerKwh: value }),
  setExportValue: (value) => set({ exportValuePerKwh: value }),
  reset: () => set({ ...initialState }),
}));
