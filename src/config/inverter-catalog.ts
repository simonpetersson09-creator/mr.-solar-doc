/**
 * Inverter catalogue — which AC products actually exist for a given electrical
 * service.
 *
 * This is the third, previously missing, layer of the sizing chain:
 *
 *   1. service capacity   (connection-capacity.ts)  what the connection carries
 *   2. allowable PV AC    (pv-connection-rules.ts)  what may be connected
 *   3. inverter product   (this file)               what can be bought and
 *                                                    connected to THIS service
 *
 * A scalar kW ceiling says nothing about whether the ceiling came from a
 * 1-phase 230 V service or a 3-phase 400 V one. Without this layer the engine
 * happily recommends a 20 kW three-phase product on a single-phase supply, or
 * a European three-phase ladder on a North-American 120/240 V split-phase
 * service. Both are technically impossible installations.
 *
 * Nothing here is country-specific unless the country's product market really
 * differs (US/CA and JP do; the EU does not).
 */

import type { ServiceType } from "./grid";

export interface InverterCatalog {
  /** Stable id, used in tests and audits. Never shown to the consumer. */
  id: string;
  serviceType: ServiceType;
  /** Rated AC power (kW) of ONE commercially available unit. */
  unitSizesKw: number[];
  /**
   * How many identical units a normal residential/small-commercial system may
   * combine. >1 only where the market really builds that way (US/CA and JP,
   * where a single split-phase product tops out around 10-12 kW).
   */
  maxUnitCount: number;
}

/**
 * EU single-phase 230 V string inverters. Single-phase products stop at
 * ~10 kW: above that the grid codes require a three-phase connection and no
 * consumer-grade single-phase product exists. 3.68 kW is the G98 class (16 A
 * at 230 V) sold specifically for UK/IE single-phase connections.
 */
export const EU_SINGLE_PHASE_INVERTER_SIZES_KW = [
  1.5, 2, 2.5, 3, 3.6, 3.68, 4, 4.6, 5, 6, 8, 10,
];

/**
 * Ladder for a three-phase 400 V service. It deliberately CONTAINS the small
 * single-phase units: a 3 kW system on a three-phase house connection is
 * normally built with a single-phase inverter on one phase, which is a real
 * and correct installation. Everything from 12 kW upwards is a three-phase
 * product and is only reachable on a three-phase service.
 */
export const EU_THREE_PHASE_INVERTER_SIZES_KW = [
  1.5, 2, 2.5, 3, 3.6, 4, 4.6, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30, 33, 36, 40, 50, 60,
];

/**
 * North-American split-phase 240 V residential string inverters / inverter
 * classes (SolarEdge, SMA Sunny Boy, Fronius Primo). The ladder is a different
 * product family from the EU one — a "5 kW EU three-phase" unit cannot be
 * installed on a 120/240 V service.
 */
export const NA_SPLIT_PHASE_INVERTER_SIZES_KW = [3, 3.8, 5, 6, 7.6, 9.6, 11.4];

/**
 * Japan: single-phase three-wire 100/200 V. Residential power conditioners are
 * sold in fixed classes; 9.9 kW is the top of the ordinary residential range
 * (the 10 kW threshold is a regulatory boundary in Japan).
 */
export const JP_SPLIT_PHASE_INVERTER_SIZES_KW = [2, 2.75, 4, 4.4, 5.5, 5.9, 9.9];

/** Countries whose split-phase product market is the Japanese one. */
const JP_SPLIT_PHASE_COUNTRIES = new Set(["JP"]);

const EU_SINGLE_PHASE_CATALOG: InverterCatalog = {
  id: "eu-single-phase",
  serviceType: "single-phase",
  unitSizesKw: EU_SINGLE_PHASE_INVERTER_SIZES_KW,
  maxUnitCount: 1,
};

const EU_TWO_PHASE_CATALOG: InverterCatalog = {
  // A phase-to-phase service carries the same single-phase product family.
  id: "eu-two-phase",
  serviceType: "two-phase",
  unitSizesKw: EU_SINGLE_PHASE_INVERTER_SIZES_KW,
  maxUnitCount: 1,
};

const EU_THREE_PHASE_CATALOG: InverterCatalog = {
  id: "eu-three-phase",
  serviceType: "three-phase",
  unitSizesKw: EU_THREE_PHASE_INVERTER_SIZES_KW,
  maxUnitCount: 1,
};

const NA_SPLIT_PHASE_CATALOG: InverterCatalog = {
  id: "na-split-phase",
  serviceType: "split-phase",
  unitSizesKw: NA_SPLIT_PHASE_INVERTER_SIZES_KW,
  // Larger North-American residential arrays are built as 2 x 7.6 / 2 x 9.6 kW,
  // never as one oversized split-phase product.
  maxUnitCount: 2,
};

const JP_SPLIT_PHASE_CATALOG: InverterCatalog = {
  id: "jp-split-phase",
  serviceType: "split-phase",
  unitSizesKw: JP_SPLIT_PHASE_INVERTER_SIZES_KW,
  maxUnitCount: 2,
};

/** The catalogue that applies to a service type in a given country. */
export function inverterCatalogFor(params: {
  serviceType: ServiceType;
  countryCode?: string | null;
}): InverterCatalog {
  const code = (params.countryCode ?? "").toUpperCase();
  switch (params.serviceType) {
    case "single-phase":
      return EU_SINGLE_PHASE_CATALOG;
    case "two-phase":
      return EU_TWO_PHASE_CATALOG;
    case "split-phase":
      return JP_SPLIT_PHASE_COUNTRIES.has(code) ? JP_SPLIT_PHASE_CATALOG : NA_SPLIT_PHASE_CATALOG;
    case "three-phase":
    default:
      return EU_THREE_PHASE_CATALOG;
  }
}

/** A buildable AC configuration: N identical units of the same product. */
export interface InverterOption {
  /** Rated AC power of one unit (kW). Always a member of the catalogue. */
  unitKw: number;
  unitCount: number;
  /** unitKw x unitCount — the value DC/AC and every AC ceiling apply to. */
  totalAcKw: number;
}

const OPTION_TOLERANCE = 1e-9;

/**
 * Every buildable configuration at or below the AC ceiling, de-duplicated on
 * total AC power with the FEWEST units winning (one 9.6 kW unit beats
 * 2 x 4.8 kW). Sorted ascending by total AC power.
 */
export function buildInverterOptions(
  catalog: InverterCatalog,
  maxTotalAcKw: number,
): InverterOption[] {
  const byTotal = new Map<string, InverterOption>();
  for (const unitKw of catalog.unitSizesKw) {
    if (!(unitKw > 0)) continue;
    for (let unitCount = 1; unitCount <= catalog.maxUnitCount; unitCount += 1) {
      const totalAcKw = unitKw * unitCount;
      if (totalAcKw > maxTotalAcKw + OPTION_TOLERANCE) break;
      const key = totalAcKw.toFixed(6);
      const existing = byTotal.get(key);
      if (!existing || unitCount < existing.unitCount) {
        byTotal.set(key, { unitKw, unitCount, totalAcKw });
      }
    }
  }
  return [...byTotal.values()].sort((a, b) => a.totalAcKw - b.totalAcKw);
}

/** True when a product size belongs to the service's catalogue. */
export function isInverterCompatible(
  unitKw: number,
  serviceType: ServiceType,
  countryCode?: string | null,
): boolean {
  return inverterCatalogFor({ serviceType, countryCode }).unitSizesKw.some(
    (kw) => Math.abs(kw - unitKw) < 1e-9,
  );
}
