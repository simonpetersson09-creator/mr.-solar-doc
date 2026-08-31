/** Shared calculation types. Pure data — no UI or framework imports. */

import type { PresentationValues } from "./presentation";
import type { MaxInvestmentResult } from "./payback";
import type { ProductionCostResult } from "./production-cost";
import type { LifetimeProjection } from "./degradation";
import type { SelfConsumptionSource, SelfConsumptionSummary } from "./self-consumption";
import type { ConsumptionInputType, ConsumptionShape } from "./consumption-shape";

import type {
  ConsumptionProfileAnalysis,
  ConsumptionProfileCategory,
  DcAcTargetRange,
} from "./consumption-profile";

export type { ConsumptionInputType, ConsumptionShape };

export type { LifetimeProjection };

export type { ProductionCostResult };

export type { SelfConsumptionSource, SelfConsumptionSummary };

export type {
  PresentationValues,
  MaxInvestmentResult,
  ConsumptionProfileAnalysis,
  ConsumptionProfileCategory,
  DcAcTargetRange,
};

/** Why the engine landed on this particular kWp / inverter combination. */
export type RecommendationReason =
  | "profile-normal"
  | "profile-unknown"
  | "profile-low-solar-season"
  | "profile-high-solar-season"
  | "profile-very-high-solar-season"
  | "grid-limit"
  | "minimum-size"
  | "maximum-size";

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
  /** Exact compass azimuth chosen on the dial (0=N, 90=E, 180=S), when set. */
  azimuthDegrees?: number | null;
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
  /** 12 values Jan..Dec — actual data or an estimated profile. */
  monthlyKwh: number[] | null;
  /** Priority: imported > monthly-manual > annual-profile > annual-only. */
  inputType?: ConsumptionInputType;
  /** Which estimated shape produced `monthlyKwh`, when estimated. */
  shape?: ConsumptionShape | null;
  /** True when `monthlyKwh` is estimated from the annual figure. */
  isEstimated?: boolean;
}

export interface ElectricalInput {
  mainFuseAmp: number;
  kwPerAmp: number;
  /** Assumed grid voltage (V). Defaults to the European 400 V assumption. */
  gridVoltageV?: number;
  /** Assumed number of phases. Defaults to 3. */
  gridPhases?: number;
  /** Grid frequency (Hz). Stored only; does not affect the power calculation. */
  gridFrequencyHz?: number;
}

/** The grid connection assumption behind the theoretical AC power. */
export interface GridAssumption {
  voltageV: number;
  phases: number;
  kwPerAmp: number;
  frequencyHz?: number;
}

/** Where a price used in the calculation came from. */
export type PriceValueSource = "standard-value" | "user-override";

export interface EconomicsInput {
  /** Assumed value of one self-consumed kWh. */
  selfConsumedValuePerKwh: number;
  /** Assumed compensation for one exported kWh. */
  exportValuePerKwh: number;
  currency: string;
  /** True when the market has no standard value and the user has not entered one. */
  valuesMissing?: boolean;
  /** How the self-consumed value was set. Defaults to the market standard value. */
  selfConsumedValueSource?: PriceValueSource;
  /** How the export value was set. Defaults to the market standard value. */
  exportValueSource?: PriceValueSource;
}

export interface CalculationInput {
  location: SiteLocation;
  resource: SolarResource;
  consumption: ConsumptionInput;
  electrical: ElectricalInput;
  economics: EconomicsInput;
  /** 0..1 share of production consumed on site. */
  selfConsumptionShare: number;
  /** True when the user actively set the share (even if it equals the default). */
  selfConsumptionShareIsUserSet?: boolean;
  /** Simple payback time the user selected, in years. */
  acceptedPaybackYears: number;
  /** Overrides the default annual production degradation (e.g. 0.005). */
  annualDegradationRate?: number;
  /** Assumed annual electricity price change scenario, e.g. 0.02 = +2 %/year. */
  annualPriceChangeRate?: number;
  /** Optional quote price entered by the user, for the reverse calculation. */
  quotePrice?: number | null;
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
  /** Desired DC/AC window that drove the selection. */
  targetDcAcRange: DcAcTargetRange;
  /** Consumption profile signal derived from monthly data + PVGIS. */
  consumptionProfile: ConsumptionProfileAnalysis;
  /** Consumer-facing explanation key for the chosen dimensioning. */
  recommendationReason: RecommendationReason;
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
  /** Self-consumption summary incl. data-quality source. */
  selfConsumedKwh: number;
  exportedKwh: number;
  selfConsumptionRate: number;
  selfSufficiencyRate: number;
  selfConsumptionSource: SelfConsumptionSource;
  economics: {
    currency: string;
    selfConsumedValuePerKwh: number;
    exportValuePerKwh: number;
    selfConsumptionValue: number;
    exportValue: number;
    totalValue: number;
    /** Standard value from the market config, or a value entered by the user. */
    selfConsumedValueSource: PriceValueSource;
    exportValueSource: PriceValueSource;
  };
  mainFuseAmp: number;
  /** Grid assumption used to derive `maxAcPowerKw`. Read by UI and PDF. */
  grid: GridAssumption;
  /** Year-by-year degraded production and economic value over the period. */
  lifetime: LifetimeProjection;
  /** Maximum motivated investment given the accepted simple payback time. */
  investment: MaxInvestmentResult;
  /** Cost per produced kWh over the period, and what a kWh is worth. */
  productionCost: ProductionCostResult;

  /** Consumer-facing, rounding-consistent values derived from the above. */
  presentation: PresentationValues;
  calculationVersion: string;
  calculatedAt: string;
  notes: string[];
}
