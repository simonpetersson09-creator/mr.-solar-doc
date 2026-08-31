/** Presentation of what the user actually stated as their connection. */

import {
  connectionCapacityAmount,
  connectionCapacityUnit,
  type ConnectionCapacity,
} from "@/config/connection-capacity";
import { formatDecimal } from "@/lib/format";

/** "20 A", "9 kVA", "4,6 kW" — always in the unit the user answered in. */
export function formatConnectionCapacity(
  capacity: ConnectionCapacity | null,
  locale: string,
): string | null {
  if (!capacity) return null;
  const amount = connectionCapacityAmount(capacity);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `${formatDecimal(amount, locale, decimals)} ${connectionCapacityUnit(capacity.type)}`;
}

/** i18n key for the result/PDF label matching the capacity input type. */
export function connectionLabelKey(capacity: ConnectionCapacity | null): string {
  switch (capacity?.type) {
    case "contracted-kva":
      return "result.connection.contractedKva";
    case "contracted-kw":
      return "result.connection.contractedKw";
    default:
      return "result.mainFuse";
  }
}
