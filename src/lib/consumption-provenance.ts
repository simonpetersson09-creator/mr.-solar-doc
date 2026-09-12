import type { ConsumptionInputType } from "@/lib/calc/consumption-shape";

/** Unknown history is not evidence of measured data. */
export function isEstimatedConsumption(type: ConsumptionInputType | undefined): boolean {
  return type !== "imported" && type !== "monthly-manual";
}

export function editedConsumptionOrigin(type: ConsumptionInputType): ConsumptionInputType {
  if (type === "annual-profile" || type === "partial-profile") return "partial-profile";
  return type;
}

export function legacyConsumptionOrigin(type: unknown): ConsumptionInputType {
  if (type === "imported" || type === "annual-profile" || type === "annual-only") return type;
  return "unknown";
}