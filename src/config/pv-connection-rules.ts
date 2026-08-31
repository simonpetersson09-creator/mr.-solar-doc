/**
 * PV connection rules — what PV power the grid operator PERMITS.
 *
 * This is a separate layer from connection capacity on purpose:
 *
 *   connection capacity  = how much power the connection can carry (A/kVA/kW)
 *   pv connection rules  = how much PV the country allows on that connection
 *
 * The two are unrelated regulatory concepts. A 25 A three-phase connection
 * (17.3 kW) may sit in a market that only permits 11 kW of PV without an
 * extended study — and a market with a 43.5 kW simplified limit does not let a
 * 16 A connection carry 43.5 kW. The sizing ceiling is therefore always the
 * MINIMUM of the two, and the engine is told which one is binding so the UI
 * and the PDF can explain the real reason to the consumer.
 *
 * Nothing here may be derived from the connection size, and the calculation
 * engine must never contain country-specific numbers.
 */

/** How well the PV rules for a country are known. Never hidden from the UI. */
export type PvRulesStatus = "verified" | "generic";

export interface PvConnectionRules {
  countryCode: string;
  status: PvRulesStatus;
  /**
   * Largest PV inverter AC power (kW) that may be connected under the normal
   * consumer process. `null` means we have no verified national ceiling — the
   * connection capacity alone then decides.
   */
  maxPvAcKw: number | null;
  /**
   * Ceiling for the simplified/registration-only process, when the country has
   * one that differs from `maxPvAcKw`. Informational: shown, never enforced.
   */
  simplifiedProcessLimitKw: number | null;
  /**
   * Permitted PV AC power as a share of the connection capacity, where the
   * market expresses its rule that way. `null` = no such rule.
   */
  maxShareOfConnectionCapacity: number | null;
  /**
   * Feed-in (export) power limitation as a share of PV DC power, where the
   * market applies one. Informational for now — it does not resize the array.
   */
  exportPowerLimitShare: number | null;
  /** Stable note keys for the UI, e.g. "pvRules.se.microproduction". */
  noteKeys: string[];
}

/**
 * Fallback for every country we have not verified. Deliberately imposes NO PV
 * ceiling: inventing a limit would silently shrink a correct recommendation,
 * which is exactly the class of quiet error this layer exists to prevent. The
 * `generic` status makes the missing knowledge visible instead.
 */
export const GENERIC_PV_CONNECTION_RULES: Omit<PvConnectionRules, "countryCode"> = {
  status: "generic",
  maxPvAcKw: null,
  simplifiedProcessLimitKw: null,
  maxShareOfConnectionCapacity: null,
  exportPowerLimitShare: null,
  noteKeys: ["pvRules.generic"],
};

/**
 * Verified national rules only. A country belongs here when its rule has been
 * checked against the national regulation, not when a plausible number exists.
 */
const VERIFIED_PV_CONNECTION_RULES: Record<
  string,
  Omit<PvConnectionRules, "countryCode" | "status">
> = {
  // Sweden: micro-production is defined by a 100 A / 43.5 kW connection point;
  // above that the normal (fee-bearing) production connection process applies.
  SE: {
    maxPvAcKw: 43.5,
    simplifiedProcessLimitKw: 43.5,
    maxShareOfConnectionCapacity: null,
    exportPowerLimitShare: null,
    noteKeys: ["pvRules.se.microproduction"],
  },
  // Germany: simplified handling for plants up to 30 kW on a consumer
  // connection; larger plants take the full connection assessment.
  DE: {
    maxPvAcKw: 30,
    simplifiedProcessLimitKw: 30,
    maxShareOfConnectionCapacity: null,
    exportPowerLimitShare: null,
    noteKeys: ["pvRules.de.simplified"],
  },
  // Austria: simplified notification up to 20 kW peak on a consumer connection.
  AT: {
    maxPvAcKw: 20,
    simplifiedProcessLimitKw: 20,
    maxShareOfConnectionCapacity: null,
    exportPowerLimitShare: null,
    noteKeys: ["pvRules.at.simplified"],
  },
  // Denmark: consumer plants are handled up to 11 kW under the simple scheme.
  DK: {
    maxPvAcKw: null,
    simplifiedProcessLimitKw: 11,
    maxShareOfConnectionCapacity: null,
    exportPowerLimitShare: null,
    noteKeys: ["pvRules.dk.simplified"],
  },
};

/** Rules for a country. Always returns a value; unknown countries are generic. */
export function getPvConnectionRules(countryCode?: string | null): PvConnectionRules {
  const code = (countryCode ?? "").toUpperCase();
  const verified = VERIFIED_PV_CONNECTION_RULES[code];
  if (!verified) return { countryCode: code, ...GENERIC_PV_CONNECTION_RULES };
  return { countryCode: code, status: "verified", ...verified };
}

/** Which rule actually caps the system. Drives the explanation, not just math. */
export type PvLimitBinding = "connection-capacity" | "pv-rule" | "capacity-share";

export interface ResolvedPvPowerLimit {
  /** The AC ceiling the sizing engine must respect (kW). */
  maxPvAcKw: number;
  binding: PvLimitBinding;
  /** The connection's own ceiling, unchanged. */
  connectionCapacityKw: number;
  /** The PV rule ceiling, when the country has one. */
  pvRuleLimitKw: number | null;
  rulesStatus: PvRulesStatus;
  noteKeys: string[];
}

/**
 * THE single place where connection capacity and PV rules are combined.
 * Everything downstream consumes `maxPvAcKw` and never re-derives it.
 */
export function resolvePvPowerLimit(params: {
  connectionCapacityKw: number;
  rules: PvConnectionRules;
}): ResolvedPvPowerLimit {
  const { connectionCapacityKw, rules } = params;

  const shareLimitKw =
    rules.maxShareOfConnectionCapacity != null
      ? connectionCapacityKw * rules.maxShareOfConnectionCapacity
      : null;

  const candidates: Array<{ kw: number; binding: PvLimitBinding }> = [
    { kw: connectionCapacityKw, binding: "connection-capacity" },
  ];
  if (rules.maxPvAcKw != null) candidates.push({ kw: rules.maxPvAcKw, binding: "pv-rule" });
  if (shareLimitKw != null) candidates.push({ kw: shareLimitKw, binding: "capacity-share" });

  // Ties resolve to the connection capacity: it is the physical constraint and
  // the one a consumer can actually recognise.
  let winner = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    if (candidate.kw < winner.kw - 1e-9) winner = candidate;
  }

  return {
    maxPvAcKw: winner.kw,
    binding: winner.binding,
    connectionCapacityKw,
    pvRuleLimitKw: rules.maxPvAcKw,
    rulesStatus: rules.status,
    noteKeys: rules.noteKeys,
  };
}
