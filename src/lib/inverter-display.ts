import { formatNumber } from "@/lib/format";

/**
 * How an inverter configuration is written for the consumer.
 *
 * A system is normally one unit ("9,6 kW"). On markets where the product
 * family tops out below the allowable PV power (US/CA and JP split-phase) the
 * real installation is several identical units, and hiding that behind a
 * single total would describe a product that does not exist: "2 × 9,6 kW".
 */
export function formatInverterPower(
  result: { inverterKw: number; inverterUnitKw?: number; inverterUnitCount?: number },
  locale: string,
): string {
  const count = result.inverterUnitCount ?? 1;
  const unitKw = result.inverterUnitKw ?? result.inverterKw;
  if (count > 1) return `${count} × ${formatNumber(unitKw, locale)} kW`;
  return `${formatNumber(result.inverterKw, locale)} kW`;
}
