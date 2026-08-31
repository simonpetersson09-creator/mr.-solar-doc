/** Client-safe types for a stored (purchased) calculation. Pure data. */

import type { CalculationResult, Orientation } from "@/lib/calc/types";
import type { ConsumptionInputType, ConsumptionShape } from "@/lib/calc/consumption-shape";
import type { PriceScenarioId } from "@/config/constants";

export const SNAPSHOT_VERSION = 1;

export interface CalculationAssumptions {
  orientation: Orientation;
  tiltDegrees: number | null;
  azimuthDegrees: number | null;
  annualConsumptionKwh: number | null;
  monthlyConsumptionKwh: number[] | null;
  consumptionInputType: ConsumptionInputType;
  consumptionShape: ConsumptionShape | null;
  mainFuseAmp: number | null;
  selfConsumptionShare: number;
  selfConsumptionShareIsUserSet: boolean;
  selfConsumedValuePerKwh: number | null;
  exportValuePerKwh: number | null;
  acceptedPaybackYears: number;
  priceScenario: PriceScenarioId;
  customPriceChangePercent: number;
  annualPriceChangeRate: number;
  quotePrice: number | null;
}

/**
 * Everything needed to re-render a purchased calculation exactly as it looked
 * when it was bought. Never recalculated with newer defaults.
 */
export interface CalculationSnapshot {
  version: number;
  createdAt: string;
  language: string;
  locale: string;
  currency: string;
  result: CalculationResult;
  assumptions: CalculationAssumptions;
}

/** Receipt metadata from the server. Contains no calculation data. */
export interface PurchaseReceipt {
  id: string;
  accessToken: string;
  createdAt: string;
  purchasedAt: string | null;
}

export type PurchaseStatus = "pending" | "paid" | "failed" | "cancelled";
