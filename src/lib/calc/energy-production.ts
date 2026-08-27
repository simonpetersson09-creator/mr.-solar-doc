/** Production is always derived from DC kWp and the location's specific yield. */

export function monthlyProduction(
  monthlyKwhPerKwp: number[],
  installedKwp: number,
): number[] {
  return monthlyKwhPerKwp.map((kwhPerKwp) => kwhPerKwp * installedKwp);
}

export function annualProduction(monthlyProductionKwh: number[]): number {
  return monthlyProductionKwh.reduce((sum, value) => sum + value, 0);
}

export function sumMonthly(values: number[]): number {
  return values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}
