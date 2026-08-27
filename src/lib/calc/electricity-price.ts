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
  const selfConsumptionValue = params.selfConsumptionKwh * params.selfConsumedValuePerKwh;
  const exportValue = params.exportedKwh * params.exportValuePerKwh;
  return {
    selfConsumptionValue,
    exportValue,
    totalValue: selfConsumptionValue + exportValue,
  };
}
