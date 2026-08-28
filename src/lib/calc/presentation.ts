/**
 * Presentation rounding. Internal maths stay unrounded; this module produces
 * the consumer-facing numbers and guarantees that the parts always add up to
 * the displayed total (no "2 088 + 2 088 = 4 176" artefacts).
 */

export interface PresentationValues {
  /** Rounded annual production, kWh. */
  annualProductionKwh: number;
  /** Rounded self-consumed energy, kWh. Sums with exportedKwh to the total. */
  selfConsumptionKwh: number;
  /** Remainder so that the two parts sum exactly to annualProductionKwh. */
  exportedKwh: number;
  /** Whole percent, sums to 100 with exportPercent. Effective, after the physical cap. */
  selfConsumptionPercent: number;
  exportPercent: number;
  /** Whole percent the user (or the default) asked for, before the physical cap. */
  requestedSelfConsumptionPercent: number;
  /** True when the physical consumption cap lowered the effective share. */
  selfConsumptionCapped: boolean;
  /** Annual consumption, kWh (rounded). */
  annualConsumptionKwh: number;
  /**
   * Annual production as a share of annual consumption, in percent.
   * NOT a self-sufficiency figure — purely a ratio of yearly totals.
   */
  productionCoveragePercent: number;
  /** Theoretical AC power limit from the main fuse, one decimal. */
  maxAcPowerKw: number;
  /** Rounded money values; the parts always sum to annualSavings. */
  selfConsumptionValue: number;
  exportValue: number;
  annualSavings: number;
}

export function buildPresentationValues(params: {
  annualProductionKwh: number;
  selfConsumptionKwh: number;
  selfConsumptionShare: number;
  /** Share asked for before the physical cap. Defaults to the effective share. */
  requestedSelfConsumptionShare?: number;
  annualConsumptionKwh: number;
  maxAcPowerKw: number;
  selfConsumptionValue: number;
  exportValue: number;
}): PresentationValues {
  const selfConsumptionValue = Math.round(params.selfConsumptionValue);
  const exportValue = Math.round(params.exportValue);
  const annualProductionKwh = Math.round(params.annualProductionKwh);
  const selfConsumptionKwh = Math.min(
    annualProductionKwh,
    Math.round(params.selfConsumptionKwh),
  );
  const selfConsumptionPercent = Math.min(100, Math.max(0, Math.round(params.selfConsumptionShare * 100)));
  const requestedSelfConsumptionPercent = Math.min(
    100,
    Math.max(
      0,
      Math.round((params.requestedSelfConsumptionShare ?? params.selfConsumptionShare) * 100),
    ),
  );

  return {
    annualProductionKwh,
    selfConsumptionKwh,
    exportedKwh: annualProductionKwh - selfConsumptionKwh,
    selfConsumptionPercent,
    exportPercent: 100 - selfConsumptionPercent,
    requestedSelfConsumptionPercent,
    selfConsumptionCapped: requestedSelfConsumptionPercent > selfConsumptionPercent,
    annualConsumptionKwh: Math.round(params.annualConsumptionKwh),
    productionCoveragePercent:
      params.annualConsumptionKwh > 0
        ? Math.round((params.annualProductionKwh / params.annualConsumptionKwh) * 100)
        : 0,
    maxAcPowerKw: Math.round(params.maxAcPowerKw * 10) / 10,
    selfConsumptionValue,
    exportValue,
    annualSavings: selfConsumptionValue + exportValue,
  };
}
