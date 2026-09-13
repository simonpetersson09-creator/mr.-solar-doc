import type { ConsumptionInputType } from "@/lib/calc/consumption-shape";

/** Unknown history is not evidence of measured data. */
export function isEstimatedConsumption(type: ConsumptionInputType | undefined): boolean {
  return type !== "imported" && type !== "monthly-manual";
}

/**
 * Origin after the customer edits a month by hand.
 * - An imported series that is edited becomes `monthly-manual`: the figures are
 *   still real, customer-supplied data (never synthetic), but they are no longer
 *   exactly what the document contained, so it must not be labelled "imported".
 *   The stored union has no "imported-and-edited" member, so the manual label is
 *   the most accurate one the data model allows.
 * - A generated/partly generated series stays partly estimated.
 */
export function editedConsumptionOrigin(type: ConsumptionInputType): ConsumptionInputType {
  if (type === "imported") return "monthly-manual";
  if (type === "annual-profile" || type === "partial-profile") return "partial-profile";
  return type;
}


export function legacyConsumptionOrigin(type: unknown): ConsumptionInputType {
  if (type === "imported" || type === "annual-profile" || type === "annual-only") return type;
  return "unknown";
}