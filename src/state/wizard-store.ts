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
  electricityPricePerKwh: number | null;
  setLocation: (location: SiteLocation | null) => void;
  setRoof: (orientation: Orientation, tiltDegrees: number | null) => void;
  setResource: (resource: SolarResource | null) => void;
  setConsumption: (annualKwh: number, monthlyKwh: number[] | null) => void;
  setMainFuse: (amp: number) => void;
  setSelfConsumptionShare: (share: number) => void;
  setElectricityPrice: (price: number) => void;
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
  electricityPricePerKwh: null,
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
  setElectricityPrice: (price) => set({ electricityPricePerKwh: price }),
  reset: () => set({ ...initialState }),
}));
