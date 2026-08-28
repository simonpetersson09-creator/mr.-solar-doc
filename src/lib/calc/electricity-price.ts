/** Clamps a numeric input to >= 0, mapping NaN/Infinity to 0. */
export function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export interface EconomicValue {
  selfConsumptionValue: number;
  exportValue: number;
  totalValue: number;
}

/**
 * Values self-consumed and exported solar separately, since they have
 * different economic worth. Both rates are calculation assumptions supplied
 * per market (or overridden by the user) — never global constants.
 */
export function calculateEconomicValue(params: {
  selfConsumptionKwh: number;
  exportedKwh: number;
  /** Value of avoided grid purchase, per kWh. */
  selfConsumedValuePerKwh: number;
  /** Compensation for energy fed to the grid, per kWh. */
  exportValuePerKwh: number;
}): EconomicValue {
  // Negative energy values are not physically meaningful in this model and
  // must never reach the economics, the investment level or the report.
  const selfConsumedRate = nonNegative(params.selfConsumedValuePerKwh);
  const exportRate = nonNegative(params.exportValuePerKwh);
  const selfConsumptionValue = nonNegative(params.selfConsumptionKwh) * selfConsumedRate;
  const exportValue = nonNegative(params.exportedKwh) * exportRate;
  return {
    selfConsumptionValue,
    exportValue,
    totalValue: selfConsumptionValue + exportValue,
  };
}
