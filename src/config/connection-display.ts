/**
 * Display semantics for a connection option — extracted so the invariant
 * "unit and prefix follow the input type" can be regression tested without
 * rendering the wizard.
 *
 * Nothing here calculates power. The only maths lives in
 * `connection-capacity.ts` / `grid.ts`.
 */

import type { ConnectionOption } from "./connections";
import {
  connectionCapacityAmount,
  connectionCapacityUnit,
  type ConnectionCapacityInputType,
} from "./connection-capacity";
import type { ServiceType } from "./grid";

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
