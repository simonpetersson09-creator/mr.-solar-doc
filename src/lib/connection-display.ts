/** Presentation of what the user actually stated as their connection. */

import {
  connectionCapacityAmount,
  connectionCapacityUnit,
  type ConnectionCapacity,
  type ConnectionCapacityInputType,
} from "@/config/connection-capacity";
import type { ConnectionOption } from "@/config/connections";
import type { ServiceType } from "@/config/grid";
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

/**
 * A per-phase prefix ("3 × ") is only meaningful for amperes, which really are
 * stated per phase. Contracted kVA/kW are TOTALS: a "3 × 9 kVA" label would
 * claim 27 kVA while the engine uses 9, so the prefix is dropped there.
 */
export function connectionOptionPrefix(option: ConnectionOption): string {
  return option.capacity.type === "amperage" ? (option.phasePrefix ?? "") : "";
}

/** "3 × 25 A", "9 kVA", "10 kW" — never "3 × 9 kVA". */
export function connectionOptionLabel(
  option: ConnectionOption,
  formatAmount: (amount: number, decimals: number) => string,
): string {
  const amount = connectionCapacityAmount(option.capacity);
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return `${connectionOptionPrefix(option)}${formatAmount(amount, decimals)} ${connectionCapacityUnit(option.capacity.type)}`;
}

/**
 * Which method note the PDF must use.
 *  - "contracted": kVA/kW markets — the subscribed total is used directly, so
 *    the note must NOT describe a "1.73 × 400 V × main fuse" formula.
 *  - "default":    ampere market on the 3-phase 400 V reference profile.
 *  - "dynamic":    ampere market on any other grid profile.
 */
export type GridMethodNoteKind = "contracted" | "default" | "dynamic";

export function gridMethodNoteKind(input: {
  inputType: ConnectionCapacityInputType | null | undefined;
  serviceType: ServiceType | null | undefined;
  voltageV: number | null | undefined;
}): GridMethodNoteKind {
  if (input.inputType === "contracted-kva" || input.inputType === "contracted-kw") {
    return "contracted";
  }
  return input.serviceType === "three-phase" && input.voltageV === 400 ? "default" : "dynamic";
}

/** Rounded display factor for the ampere formula. Never used for kVA/kW. */
export function gridAcDisplayFactor(serviceType: ServiceType | null | undefined): number {
  return serviceType === "three-phase" ? 1.73 : 1;
}
