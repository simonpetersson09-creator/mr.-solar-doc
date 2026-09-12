import type { PresentationValues } from "@/lib/calc/presentation";

/**
 * Which explanation belongs to a capped self-consumption share.
 *
 * A monthly cap that comes from a generated monthly profile is model-dependent,
 * so it must be worded differently from a cap based on the household's own
 * monthly figures. Returns null when nothing was capped.
 */
export function selfConsumptionCapNoteKey(
  presentation: Pick<
    PresentationValues,
    "selfConsumptionCapped" | "selfConsumptionCapBinding" | "selfConsumptionCapIsModelled" | "estimatedMonthlyDeviation"
  >,
): string | null {
  if (!presentation.selfConsumptionCapped) return presentation.estimatedMonthlyDeviation
    ? "result.selfConsumptionEstimatedDeviationNote" : null;
  if (presentation.estimatedMonthlyDeviation && presentation.selfConsumptionCapBinding === "annual-consumption") {
    return "result.selfConsumptionAnnualAndEstimatedNote";
  }
  if (presentation.selfConsumptionCapBinding === "monthly-overlap") {
    return presentation.selfConsumptionCapIsModelled
      ? "result.selfConsumptionCappedMonthlyModelledNote"
      : "result.selfConsumptionCappedMonthlyNote";
  }
  return "result.selfConsumptionCappedNote";
}
