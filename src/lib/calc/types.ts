/** Shared calculation types. Pure data — no UI or framework imports. */

import type { PresentationValues } from "./presentation";

export type { PresentationValues };

export type ValueOrigin = "user" | "calculated" | "assumed" | "external";

export interface Traced<T> {
  value: T;
  origin: ValueOrigin;
  /** Optional external source label, e.g. "PVGIS SARAH3". */
  source?: string;
}

export type Orientation = "unknown" | "south" | "southeast" | "southwest" | "east" | "west";

export interface SolarResource {
  /** kWh per installed kWp per year at this location/configuration. */
  annualKwhPerKwp: number;
  /** 12 values, January..December, kWh per kWp. */
  monthlyKwhPerKwp: number[];
  orientation: Orientation;
  /** Tilt in degrees, or null when optimal tilt was assumed. */
  tiltDegrees: number | null;
  orientationAssumed: boolean;
  tiltAssumed: boolean;
  dataSource: string;
  calculationDate: string;
}

export interface SiteLocation {
  address: string;
  latitude: number;
  longitude: number;
  countryCode: string;
  region: string;
}

export interface ConsumptionInput {
  annualKwh: number;
  /** 12 values Jan..Dec when the user provided monthly detail. */
  monthlyKwh: number[] | null;
}

export interface ElectricalInput {
  mainFuseAmp: number;
  kwPerAmp: number;
}

export interface EconomicsInput {
  /** Assumed value of one self-consumed kWh. */
  selfConsumedValuePerKwh: number;
  /** Assumed compensation for one exported kWh. */
  exportValuePerKwh: number;
  currency: string;
  /** True when the market has no verified default and the user has not entered one. */
  valuesMissing?: boolean;
}

export interface CalculationInput {
  location: SiteLocation;
  resource: SolarResource;
  consumption: ConsumptionInput;
  electrical: ElectricalInput;
  economics: EconomicsInput;
  /** 0..1 share of production consumed on site. */
  selfConsumptionShare: number;
  inverterSizesKw: number[];
}

/** Why the recommended array ended up at this size. */
export type SizingBasis =
  | "consumption"
  | "grid-limit"
  | "inverter-limit"
  | "minimum-size"
  | "maximum-size";

export interface CalculationResult {
  location: SiteLocation;
  resource: SolarResource;
  installedKwp: number;
  /** Estimated number of modules for the recommended array. */
  panelCount: number;
  sizingBasis: SizingBasis;
  inverterKw: number;
  maxAcPowerKw: number;
  dcAcRatio: number;
  oversizingPercent: number;
  monthlyProductionKwh: number[];
  annualProductionKwh: number;
  consumption: ConsumptionInput;
  selfConsumption: {
    share: number;
    kwh: number;
  };
  exported: {
    share: number;
    kwh: number;
  };
  economics: {
    currency: string;
    selfConsumedValuePerKwh: number;
    exportValuePerKwh: number;
    selfConsumptionValue: number;
    exportValue: number;
    totalValue: number;
  };
  mainFuseAmp: number;
  /** Consumer-facing, rounding-consistent values derived from the above. */
  presentation: PresentationValues;
  calculationVersion: string;
  calculatedAt: string;
  notes: string[];
}
