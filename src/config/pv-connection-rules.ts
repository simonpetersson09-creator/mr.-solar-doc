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

import type { ServiceType } from "./grid";

/** How well the PV rules for a country are known. Never hidden from the UI. */
export type PvRulesStatus = "verified" | "generic";

/**
 * NEC 705.12(B)(3)(2)-style busbar rule (US/CA). The sum of the service
 * overcurrent device and the PV backfeed breaker may not exceed
 * `busbarFactor` x the busbar rating. With a busbar rated at the service
 * amperage this leaves (factor - 1) x A for PV:
 *
 *   US 200 A: 0.2 x 200 A / 1.25 x 240 V = 7.68 kW inverter AC
 *   CA 200 A: 0.25 x 200 A / 1.25 x 240 V = 9.6 kW inverter AC
 *
 * This is why a 200 A / 48 kW service capacity is NOT 48 kW of allowable PV.
 */
export interface BusbarBackfeedRule {
  busbarFactor: number;
  /**
   * The rule limits the PV backfeed BREAKER, which must be sized at this
   * multiple of the inverter's continuous output current. The usable inverter
   * AC power is therefore the breaker share divided by this factor.
   * NEC 705.12(B)(3)(2) (US): 125 % of the inverter output current.
   */
  outputCurrentFactor?: number;
}

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
   * Service-type dependent ceilings, where the national rule is expressed per
   * phase model. Takes precedence over `maxPvAcKw` for that service type.
   */
  maxPvAcKwByService: Partial<Record<ServiceType, number>> | null;
  /**
   * Ceiling for the simplified/registration-only process, when the country has
   * one that differs from `maxPvAcKw`. Informational: shown, never enforced.
   */
  simplifiedProcessLimitKw: number | null;
  /** Simplified-process ceiling per service type (e.g. GB G98). Informational. */
  simplifiedProcessLimitKwByService: Partial<Record<ServiceType, number>> | null;
  /**
   * Permitted PV AC power as a share of the connection capacity, where the
   * market expresses its rule that way. `null` = no such rule.
   */
  maxShareOfConnectionCapacity: number | null;
  /** Busbar/backfeed rule (US/CA). `null` where the market has none. */
  busbarBackfeedRule: BusbarBackfeedRule | null;
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
  maxPvAcKwByService: null,
  simplifiedProcessLimitKw: null,
  simplifiedProcessLimitKwByService: null,
  maxShareOfConnectionCapacity: null,
  busbarBackfeedRule: null,
  exportPowerLimitShare: null,
  noteKeys: ["pvRules.generic"],
};


/** Shorthand so each entry only states the fields it really has a rule for. */
function verified(
  rules: Partial<Omit<PvConnectionRules, "countryCode" | "status">> & { noteKeys: string[] },
): Omit<PvConnectionRules, "countryCode" | "status"> {
  const { status: _status, ...generic } = GENERIC_PV_CONNECTION_RULES;
  return { ...generic, ...rules };
}

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
  SE: verified({
    maxPvAcKw: 43.5,
    simplifiedProcessLimitKw: 43.5,
    noteKeys: ["pvRules.se.microproduction"],
  }),
  // Germany: simplified handling for plants up to 30 kW on a consumer
  // connection; larger plants take the full connection assessment. Single-phase
  // feed-in is limited to 4.6 kVA (VDE-AR-N 4105 unbalanced-load limit).
  DE: verified({
    maxPvAcKw: 30,
    maxPvAcKwByService: { "single-phase": 4.6, "two-phase": 4.6 },
    simplifiedProcessLimitKw: 30,
    noteKeys: ["pvRules.de.simplified"],
  }),
  // Austria: simplified notification up to 20 kW peak on a consumer connection.
  // The same 4.6 kVA unbalanced-load limit applies to single-phase feed-in.
  AT: verified({
    maxPvAcKw: 20,
    maxPvAcKwByService: { "single-phase": 4.6, "two-phase": 4.6 },
    simplifiedProcessLimitKw: 20,
    noteKeys: ["pvRules.at.simplified"],
  }),
  // Denmark: consumer plants are handled up to 11 kW under the simple scheme,
  // and that ceiling is what a consumer installation may be sized against.
  DK: verified({
    maxPvAcKw: 11,
    simplifiedProcessLimitKw: 11,
    noteKeys: ["pvRules.dk.simplified"],
  }),
  // United Kingdom: no national kW cap, but G98 gives fast-track connection at
  // 16 A/phase (3.68 kW single-phase, 11.04 kW three-phase); above that a G99
  // application to the DNO is required. Informational, never enforced.
  GB: verified({
    simplifiedProcessLimitKwByService: { "single-phase": 3.68, "three-phase": 11.04 },
    noteKeys: ["pvRules.gb.g98"],
  }),
  IE: verified({
    simplifiedProcessLimitKwByService: { "single-phase": 6, "three-phase": 11.04 },
    noteKeys: ["pvRules.ie.nc6"],
  }),
  // United States / Canada: the binding constraint is the busbar/backfeed rule,
  // not the service capacity. 120 % of a busbar rated at the service amperage
  // leaves 20 % of it for PV.
  // NEC 705.12(B)(3)(2): 125 % of inverter output current + main breaker
  // <= 120 % of busbar. Simplification: busbar rated = main breaker = service A.
  US: verified({
    busbarBackfeedRule: { busbarFactor: 1.2, outputCurrentFactor: 1.25 },
    noteKeys: ["pvRules.us.busbar"],
  }),
  // CEC 64-112: sum of supply overcurrent devices <= 125 % of busbar in
  // dwellings; the inverter breaker is sized at 125 % of continuous output.
  // Net effect equals 20 % of the busbar as inverter AC (same simplification).
  CA: verified({
    busbarBackfeedRule: { busbarFactor: 1.25, outputCurrentFactor: 1.25 },
    noteKeys: ["pvRules.ca.busbar"],
  }),
};

/** Rules for a country. Always returns a value; unknown countries are generic. */
export function getPvConnectionRules(countryCode?: string | null): PvConnectionRules {
  const code = (countryCode ?? "").toUpperCase();
  const rules = VERIFIED_PV_CONNECTION_RULES[code];
  if (!rules) return { countryCode: code, ...GENERIC_PV_CONNECTION_RULES };
  return { countryCode: code, status: "verified", ...rules };
}

/**
 * Service amperage above which a residential service is normally split over
 * more than one panel (e.g. "400 A class" = 320 A continuous meter main with
 * two 200 A disconnects). Above it the PV panel is never assumed to carry the
 * whole service rating.
 */
export const LARGEST_SINGLE_PANEL_SERVICE_A = 225;
/** Preliminary PV panel assumed for a split service when the user does not know. */
export const SPLIT_SERVICE_ASSUMED_PANEL_A = 200;

/**
 * The panel (load centre) the PV connects to — distinct from the home's total
 * service. `mainAssumed` / `busbarAssumed` say which values are preliminary.
 */
export interface BusbarBasis {
  serviceAmperageA: number;
  panelMainBreakerA: number;
  busbarRatingA: number;
  mainAssumed: boolean;
  busbarAssumed: boolean;
  /** True when the service is above LARGEST_SINGLE_PANEL_SERVICE_A. */
  largeService: boolean;
  /** Largest PV backfeed breaker the rule allows (A), >= 0. */
  maxBackfeedBreakerA: number;
  /** Inverter AC power (kW) the busbar rule allows on this panel. */
  limitKw: number;
}

/** Which rule actually caps the system. Drives the explanation, not just math. */
export type PvLimitBinding =
  | "connection-capacity"
  | "pv-rule"
  | "capacity-share"
  | "service-pv-rule"
  | "busbar-rule";

export interface ResolvedPvPowerLimit {
  /** The AC ceiling the sizing engine must respect (kW). */
  maxPvAcKw: number;
  binding: PvLimitBinding;
  /** The connection's own ceiling, unchanged. */
  connectionCapacityKw: number;
  /** The PV rule ceiling, when the country has one. */
  pvRuleLimitKw: number | null;
  /** The busbar/backfeed ceiling, when the market has such a rule. */
  busbarLimitKw: number | null;
  /** Simplified-process ceiling that applies to this service. Informational. */
  simplifiedProcessLimitKw: number | null;
  /** Panel data behind the busbar ceiling, incl. which values were assumed. */
  busbarBasis: BusbarBasis | null;
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
  /** Phase model of the service — required for service-specific rules. */
  serviceType?: ServiceType | null;
  /** Service overcurrent rating (A), for the busbar rule. */
  serviceAmperageA?: number | null;
  /** Line-to-line reference voltage (V), for the busbar rule. */
  voltageV?: number | null;
  /** Main breaker of the panel the PV connects to (A). Null = unknown. */
  panelMainBreakerA?: number | null;
  /** Busbar rating of that panel (A). Null = unknown ("Don't know"). */
  busbarRatingA?: number | null;
}): ResolvedPvPowerLimit {
  const { connectionCapacityKw, rules, serviceType = null } = params;

  const shareLimitKw =
    rules.maxShareOfConnectionCapacity != null
      ? connectionCapacityKw * rules.maxShareOfConnectionCapacity
      : null;

  const serviceLimitKw =
    serviceType && rules.maxPvAcKwByService
      ? (rules.maxPvAcKwByService[serviceType] ?? null)
      : null;

  // Busbar rule (NEC 705.12(B)(3)(2) / CEC 64-112): the PV backfeed breaker
  // may use factor x busbar - main breaker of THAT panel; the breaker is sized
  // at outputCurrentFactor x the inverter output current.
  let busbarBasis: BusbarBasis | null = null;
  let busbarLimitKw: number | null = null;
  const serviceA = params.serviceAmperageA;
  if (rules.busbarBackfeedRule && serviceA && params.voltageV) {
    const largeService = serviceA > LARGEST_SINGLE_PANEL_SERVICE_A;
    const knownMain = params.panelMainBreakerA && params.panelMainBreakerA > 0 ? params.panelMainBreakerA : null;
    const knownBus = params.busbarRatingA && params.busbarRatingA > 0 ? params.busbarRatingA : null;
    const panelMainBreakerA =
      knownMain ?? (largeService ? SPLIT_SERVICE_ASSUMED_PANEL_A : serviceA);
    const busbarRatingA = knownBus ?? panelMainBreakerA;
    const maxBackfeedBreakerA = Math.max(
      0,
      rules.busbarBackfeedRule.busbarFactor * busbarRatingA - panelMainBreakerA,
    );
    busbarLimitKw =
      (maxBackfeedBreakerA * params.voltageV) /
      (rules.busbarBackfeedRule.outputCurrentFactor ?? 1) /
      1000;
    busbarBasis = {
      serviceAmperageA: serviceA,
      panelMainBreakerA,
      busbarRatingA,
      mainAssumed: knownMain == null,
      busbarAssumed: knownBus == null,
      largeService,
      maxBackfeedBreakerA,
      limitKw: busbarLimitKw,
    };
  }

  const candidates: Array<{ kw: number; binding: PvLimitBinding }> = [
    { kw: connectionCapacityKw, binding: "connection-capacity" },
  ];
  if (rules.maxPvAcKw != null) candidates.push({ kw: rules.maxPvAcKw, binding: "pv-rule" });
  if (serviceLimitKw != null) candidates.push({ kw: serviceLimitKw, binding: "service-pv-rule" });
  if (shareLimitKw != null) candidates.push({ kw: shareLimitKw, binding: "capacity-share" });
  if (busbarLimitKw != null) candidates.push({ kw: busbarLimitKw, binding: "busbar-rule" });

  // Ties resolve to the connection capacity: it is the physical constraint and
  // the one a consumer can actually recognise.
  let winner = candidates[0]!;
  for (const candidate of candidates.slice(1)) {
    if (candidate.kw < winner.kw - 1e-9) winner = candidate;
  }

  const simplifiedProcessLimitKw =
    (serviceType && rules.simplifiedProcessLimitKwByService?.[serviceType]) ??
    rules.simplifiedProcessLimitKw ??
    null;

  return {
    maxPvAcKw: winner.kw,
    binding: winner.binding,
    connectionCapacityKw,
    pvRuleLimitKw: serviceLimitKw ?? rules.maxPvAcKw,
    busbarLimitKw,
    simplifiedProcessLimitKw,
    busbarBasis,
    rulesStatus: rules.status,
    noteKeys: rules.noteKeys,
  };
}

