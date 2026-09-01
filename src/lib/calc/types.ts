/** Shared calculation types. Pure data — no UI or framework imports. */

import type { CalculationIssue } from "./validation";
import type { PresentationValues } from "./presentation";
import type { MaxInvestmentResult } from "./payback";
import type { ProductionCostResult } from "./production-cost";
import type { LifetimeProjection } from "./degradation";
import type { SelfConsumptionSource, SelfConsumptionSummary } from "./self-consumption";
import type { ConsumptionInputType, ConsumptionShape } from "./consumption-shape";
import type { ServiceType } from "@/config/grid";
import type { PvLimitBinding, PvRulesStatus } from "@/config/pv-connection-rules";
import type { ConnectionCapacity } from "@/config/connection-capacity";
import type { ConnectionProfileStatus } from "@/config/connections";

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
  /**
   * Main fuse / service rating in amperes. OPTIONAL: markets that state their
   * connection in kVA or kW never provide it. The engine never requires it.
   */
  mainFuseAmp?: number | null;
  /**
   * The normalised AC ceiling of the connection. When present the engine uses
   * it directly — it is the only value the sizing logic needs, regardless of
   * how the user stated their connection.
   */
  maxAcPowerKw?: number | null;
  /** What the user actually stated, kept for presentation only. */
  connection?: ConnectionCapacity | null;

  /**
   * kW per ampere. Optional legacy input: when `gridVoltageV` is provided the
   * engine derives the factor centrally from the service type instead.
   */
  kwPerAmp?: number;
  /**
   * Grid voltage (V). Line-to-line for three-phase services, line-to-neutral
   * for single-phase services. Never mix the two.
   */
  gridVoltageV?: number;
  /** Number of phases (1 or 3). Defaults to 3. */
  gridPhases?: number;
  /** Explicit service type; derived from `gridPhases` when omitted. */
  serviceType?: ServiceType;
  /** Grid frequency (Hz). Stored only; does not affect the power calculation. */
  gridFrequencyHz?: number;
  /**
   * How well the country's grid data is known. Travels with the calculation so
   * the result and the PDF can state it — never re-derived in the UI.
   */
  gridProfileStatus?: ConnectionProfileStatus;
  /**
   * PV power the country permits on this connection (kW), from the PV rules
   * layer. Optional: when absent only the connection capacity limits sizing.
   */
  pvPowerLimitKw?: number | null;
  /** Which rule bound the ceiling, resolved outside the engine. */
  pvLimitBinding?: PvLimitBinding;
  /** Status of the country's PV rules. */
  pvRulesStatus?: PvRulesStatus;
  /** True when the user confirmed unverified grid data (required in step 4). */
  gridProfileConfirmed?: boolean;
}


/** The grid connection assumption behind the theoretical AC power. */
export interface GridAssumption {
  /** Line-to-line for three-phase, line-to-neutral for single-phase. */
  voltageV: number;
  phases: number;
  serviceType: ServiceType;
  kwPerAmp: number;
  frequencyHz: number;
  /** Knowledge level of the country's grid profile behind these assumptions. */
  profileStatus: ConnectionProfileStatus;
  /** True when the user explicitly confirmed unverified grid data. */
  profileConfirmed: boolean;
}

/**
 * Availability of one economic input.
 *  - "available": we have a number (0 is a real, verified number)
 *  - "missing": no verified value and no user input — never treated as 0
 *  - "not-applicable": the component does not exist in this country
 */
export type EconomicAvailability = "available" | "missing" | "not-applicable";

export interface EconomicsAvailability {
  selfConsumedValue: EconomicAvailability;
  exportValue: EconomicAvailability;
  installationCost: EconomicAvailability;
  gridCompensation: EconomicAvailability;
  /** True only when every value needed for a total is available. */
  totalsComplete: boolean;
}

/** Where a price used in the calculation came from. */
export type PriceValueSource = "standard-value" | "user-override";

export interface EconomicsInput {
  /**
   * Assumed value of one self-consumed kWh. `null` means the value is unknown
   * (no verified country default, no user input) — it is NOT zero.
   */
  selfConsumedValuePerKwh: number | null;
  /** Assumed compensation for one exported kWh. `null` = unknown, not zero. */
  exportValuePerKwh: number | null;
  /** Installation cost per kWp. `null` = unknown, not zero. */
  installationCostPerKwp?: number | null;
  /** Grid benefit per kWh. `null` = unknown; `0` = verified "no compensation". */
  gridCompensationPerKwh?: number | null;
  /** False when the country has no grid-benefit component at all. */
  gridCompensationEnabled?: boolean;
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
  /** Module nameplate power (kWp). Defaults to PANEL_WATTAGE_KWP. */
  panelPowerKwp?: number;
}

/** Why the recommended array ended up at this size. */
export type SizingBasis =
  | "consumption"
  | "grid-limit"
  /** Capped by what the country permits to connect, not by the connection. */
  | "pv-rule-limit"
  | "inverter-limit"
  | "minimum-size"
  | "maximum-size";

export interface CalculationResult {
  location: SiteLocation;
  resource: SolarResource;
  /** Physical DC power: always exactly panelCount x panelPowerKwp. */
  installedKwp: number;
  /** Whole number of modules in the recommended array. Source of truth. */
  panelCount: number;
  /** Nameplate power of one module (kWp) behind `installedKwp`. */
  panelPowerKwp: number;
  sizingBasis: SizingBasis;
  /** Chosen inverter's rated AC power. */
  inverterKw: number;
  /** The grid connection's AC ceiling (from the connection capacity). */
  maxAcPowerKw: number;
  /**
   * Same value as `maxAcPowerKw`, named for what it is so UI and PDF never
   * present a grid limit as an inverter limitation.
   */
  gridConnectionLimitKw: number;
  /**
   * The AC ceiling actually used for sizing: the lower of the connection
   * capacity and what the country permits to connect (see
   * `@/config/pv-connection-rules`).
   */
  pvPowerLimitKw: number;
  /** Which rule was binding. Drives the explanation, never re-derived in UI. */
  pvLimitBinding: PvLimitBinding;
  /** Whether the country's PV rules are verified or a generic fallback. */
  pvRulesStatus: PvRulesStatus;

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
    /** Which economic inputs were known. Presentation must respect this. */
    availability: EconomicsAvailability;
    /** Grid benefit per kWh when the country has one and it is known. */
    gridCompensationPerKwh: number | null;
    /** Installation cost per kWp when known. */
    installationCostPerKwp: number | null;
  };
  /** Amperes when the market states amperes, otherwise null. */
  mainFuseAmp: number | null;
  /** What the user stated (amperes / kVA / kW). Presentation only. */
  connection: ConnectionCapacity | null;
  /** Grid assumption used to derive `maxAcPowerKw`. Read by UI and PDF. */
  grid: GridAssumption;
  /** Year-by-year degraded production and economic value over the period. */
  lifetime: LifetimeProjection;
  /** Maximum motivated investment given the accepted simple payback time. */
  investment: MaxInvestmentResult;
  /** Cost per produced kWh over the period, and what a kWh is worth. */
  productionCost: ProductionCostResult;

  /**
   * Whether every economic input needed for the money figures was available.
   * "incomplete" means savings, payback, lifetime value, LCOE and the maximum
   * investment MUST NOT be presented as numbers — not even as 0.
   */
  economicsStatus: "complete" | "incomplete";

  /** Consumer-facing, rounding-consistent values derived from the above. */
  presentation: PresentationValues;
  calculationVersion: string;
  calculatedAt: string;
  notes: string[];
}

/** Explicit calculation outcome. A result only exists on "success". */
export type CalculationOutcome =
  | { status: "success"; result: CalculationResult }
  /** Controlled domain outcome: the connection is too small for any inverter. */
  | {
      status: "grid-too-small";
      maxAcPowerKw: number;
      minimumSupportedInverterKw: number;
    }
  | { status: "validation-error"; phase: "input" | "result"; issues: CalculationIssue[] };
