/** Client-safe types for a stored (purchased) calculation. Pure data. */

import type { CalculationResult, Orientation } from "@/lib/calc/types";
import type { LoadProfileClass } from "@/lib/calc/self-consumption";
import type { ConsumptionInputType, ConsumptionShape } from "@/lib/calc/consumption-shape";
import type { PriceScenarioId } from "@/config/constants";
import type { ConnectionCapacity } from "@/config/connection-capacity";

export const SNAPSHOT_VERSION = 2;

import { legacyConsumptionOrigin, isEstimatedConsumption } from "@/lib/consumption-provenance";

/** Historical purchased amounts are immutable; only correct uncertain provenance on read. */
export function readCalculationSnapshot(snapshot: CalculationSnapshot): CalculationSnapshot {
  if (snapshot.version >= 2) return snapshot;
  const inputType = legacyConsumptionOrigin(snapshot.assumptions.consumptionInputType);
  const isEstimated = isEstimatedConsumption(inputType);
  return {
    ...snapshot,
    assumptions: { ...snapshot.assumptions, consumptionInputType: inputType },
    result: {
      ...snapshot.result,
      consumption: { ...snapshot.result.consumption, inputType, isEstimated },
      presentation: {
        ...snapshot.result.presentation,
        selfConsumptionCapIsModelled: isEstimated && snapshot.result.presentation.selfConsumptionCapBinding === "monthly-overlap",
      },
    },
  };
}

export interface CalculationAssumptions {
  orientation: Orientation;
  tiltDegrees: number | null;
  azimuthDegrees: number | null;
  annualConsumptionKwh: number | null;
  monthlyConsumptionKwh: number[] | null;
  consumptionInputType: ConsumptionInputType;
  consumptionShape: ConsumptionShape | null;
  mainFuseAmp: number | null;
  /** What the user stated as their connection (A / kVA / kW). */
  connectionCapacity?: ConnectionCapacity | null;
  selfConsumptionShare: number;
  selfConsumptionShareIsUserSet: boolean;
  /** Omitted in snapshots taken before the question existed = "mixed". */
  loadProfileClass?: LoadProfileClass;
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
