export interface EconomicValue {
  selfConsumptionValue: number;
  exportValue: number;
  totalValue: number;
}

/**
 * Basic economic value. Export is currently valued at the same assumed price
 * as self-consumption; a market-specific export compensation model can be
 * added here later without touching the UI.
 */
export function calculateEconomicValue(params: {
  selfConsumptionKwh: number;
  exportedKwh: number;
  electricityPricePerKwh: number;
  exportPricePerKwh?: number;
}): EconomicValue {
  const exportPrice = params.exportPricePerKwh ?? params.electricityPricePerKwh;
  const selfConsumptionValue = params.selfConsumptionKwh * params.electricityPricePerKwh;
  const exportValue = params.exportedKwh * exportPrice;
  return {
    selfConsumptionValue,
    exportValue,
    totalValue: selfConsumptionValue + exportValue,
  };
}
