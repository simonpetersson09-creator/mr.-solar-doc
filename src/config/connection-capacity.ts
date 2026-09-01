/**
 * Connection capacity — the generic layer between how a consumer states their
 * electrical connection locally and the single number the sizing engine needs.
 *
 *   country -> local connection input -> ConnectionCapacity
 *           -> connectionCapacityToMaxAcPowerKw() -> maxAcPowerKw -> sizing
 *
 * The calculation engine never needs to know whether the user answered in
 * amperes, "3 x 25 A", kVA or kW. Everything is normalised here, once.
 *
 * Connection capacity is NOT the PV power the grid operator permits. That is a
 * separate concept (see `pvConnectionRules` in `@/config/countries`) and must
 * never be derived from the connection size.
 */

import {
  DEFAULT_GRID_FREQUENCY_HZ,
  PHASE_COUNT_FOR_SERVICE_TYPE,
  maxAcPowerKwFor,
  type PhaseCount,
  type ServiceType,
} from "./grid";

/** How the consumer states their connection in a given market. */
export type ConnectionCapacityInputType = "amperage" | "contracted-kva" | "contracted-kw";

/**
 * Input units the generic (unsupported/manual) fallback offers. A consumer in
 * a market we have no verified profile for may state the connection as a fuse
 * rating (A), a contracted active power (kW) or a contracted apparent power
 * (kVA) — no country-specific formula is involved, only the generic rules:
 *   A   -> service physics (phase model + voltage)
 *   kW  -> 1:1
 *   kVA -> kVA x power factor
 */
export const FALLBACK_INPUT_TYPES: readonly ConnectionCapacityInputType[] = [
  "amperage",
  "contracted-kw",
  "contracted-kva",
];

/** Electrical profile of the connection. Required for ampere-based input. */
export interface ConnectionGridProfile {
  serviceType: ServiceType;
  /** Reference voltage: line-to-line, except single-phase (line-to-neutral). */
  voltageV: number;
  /** Line-to-neutral voltage where it differs (120 V of a 120/240 V service). */
  lineToNeutralVoltageV?: number | null;
  frequencyHz: number;
}

export type ConnectionCapacity =
  | ({ type: "amperage"; amperageA: number } & ConnectionGridProfile)
  | ({ type: "contracted-kva"; kva: number } & Partial<ConnectionGridProfile>)
  | ({ type: "contracted-kw"; kw: number } & Partial<ConnectionGridProfile>);

/**
 * EXPLICIT ASSUMPTION — kVA to kW.
 *
 * A contracted apparent power (kVA) is converted to an active-power ceiling
 * with power factor 1.0. Grid connection capacity is stated as apparent power,
 * and inverter/service sizing in this app works with active power at unity
 * power factor, so 6 kVA is treated as a 6 kW ceiling.
 *
 * This is a documented assumption in the normalisation layer, never a hidden
 * conversion inside the engine. A country config may override it via
 * `contractedKvaPowerFactor` when verified local data says otherwise.
 */
export const DEFAULT_CONTRACTED_KVA_POWER_FACTOR = 1;

export interface NormalizedConnection {
  inputType: ConnectionCapacityInputType;
  /** The single value the sizing engine consumes. */
  maxAcPowerKw: number;
  /**
   * Amperes, for display only. Present as given for ampere markets, derived
   * (and clearly not a fuse the user has ever seen) for kVA/kW markets when a
   * grid profile is known, otherwise null.
   */
  amperageA: number | null;
  amperageIsDerived: boolean;
  serviceType: ServiceType | null;
  phaseCount: PhaseCount | null;
  voltageV: number | null;
  frequencyHz: number | null;
  /** Power factor actually applied (kVA input only). */
  powerFactor: number | null;
}

/** THE single normalisation point. Nothing else may convert capacity to kW. */
export function connectionCapacityToMaxAcPowerKw(
  capacity: ConnectionCapacity,
  options: { contractedKvaPowerFactor?: number } = {},
): number {
  switch (capacity.type) {
    case "amperage":
      // Reuses the one grid power rule: factor(serviceType) x U x I / 1000.
      return maxAcPowerKwFor({
        mainFuseAmp: capacity.amperageA,
        voltageV: capacity.voltageV,
        serviceType: capacity.serviceType,
        lineToNeutralVoltageV: capacity.lineToNeutralVoltageV ?? null,
      });
    case "contracted-kw":
      // Already active power — no detour via amperes.
      return capacity.kw;
    case "contracted-kva":
      // Apparent power -> active power with the documented power factor.
      return (
        capacity.kva *
        (options.contractedKvaPowerFactor ?? DEFAULT_CONTRACTED_KVA_POWER_FACTOR)
      );
  }
}

/** Full normalisation, including display-only derived amperes. */
export function normalizeConnectionCapacity(
  capacity: ConnectionCapacity,
  options: { contractedKvaPowerFactor?: number } = {},
): NormalizedConnection {
  const maxAcPowerKw = connectionCapacityToMaxAcPowerKw(capacity, options);
  const serviceType = capacity.serviceType ?? null;
  const voltageV = capacity.voltageV ?? null;
  const frequencyHz = capacity.frequencyHz ?? null;

  let amperageA: number | null = null;
  let amperageIsDerived = false;
  if (capacity.type === "amperage") {
    amperageA = capacity.amperageA;
  } else if (serviceType && voltageV) {
    const kwPerAmp = maxAcPowerKwFor({ mainFuseAmp: 1, voltageV, serviceType });
    amperageA = kwPerAmp > 0 ? maxAcPowerKw / kwPerAmp : null;
    amperageIsDerived = amperageA !== null;
  }

  return {
    inputType: capacity.type,
    maxAcPowerKw,
    amperageA,
    amperageIsDerived,
    serviceType,
    phaseCount: serviceType ? PHASE_COUNT_FOR_SERVICE_TYPE[serviceType] : null,
    voltageV,
    frequencyHz: frequencyHz ?? (serviceType ? DEFAULT_GRID_FREQUENCY_HZ : null),
    powerFactor:
      capacity.type === "contracted-kva"
        ? (options.contractedKvaPowerFactor ?? DEFAULT_CONTRACTED_KVA_POWER_FACTOR)
        : null,
  };
}

/** The numeric amount a capacity carries, in its own unit. */
export function connectionCapacityAmount(capacity: ConnectionCapacity): number {
  switch (capacity.type) {
    case "amperage":
      return capacity.amperageA;
    case "contracted-kva":
      return capacity.kva;
    case "contracted-kw":
      return capacity.kw;
  }
}

/** Unit symbol for a capacity input type. Not translated — SI/technical. */
export function connectionCapacityUnit(type: ConnectionCapacityInputType): string {
  return type === "amperage" ? "A" : type === "contracted-kva" ? "kVA" : "kW";
}

/** Plausibility bounds per input type for free-form entry. */
export const CAPACITY_BOUNDS: Record<
  ConnectionCapacityInputType,
  { min: number; max: number }
> = {
  amperage: { min: 6, max: 400 },
  "contracted-kva": { min: 1, max: 250 },
  "contracted-kw": { min: 1, max: 250 },
};

export function isValidConnectionCapacity(capacity: ConnectionCapacity | null): boolean {
  if (!capacity) return false;
  const amount = connectionCapacityAmount(capacity);
  const bounds = CAPACITY_BOUNDS[capacity.type];
  return Number.isFinite(amount) && amount >= bounds.min && amount <= bounds.max;
}

/** Builds an amperage capacity from a grid profile. Used by state migration. */
export function amperageCapacity(
  amperageA: number,
  profile: ConnectionGridProfile,
): ConnectionCapacity {
  return { type: "amperage", amperageA, ...profile };
}
