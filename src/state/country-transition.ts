/**
 * Central market/country transition.
 *
 * When the country behind the address changes, EVERY country-dependent value
 * must be revalidated in ONE place. Spreading reset logic across step
 * components is how stale Belgian prices end up in a Swedish calculation, so
 * components never reset country data themselves — they call `setLocation`,
 * which applies this transition.
 *
 * Country-dependent (always reset):
 *   connection capacity + selected option, grid service type / voltage /
 *   line-to-neutral / frequency, manual grid override flag, grid confirmation,
 *   electricity price, export price, quote price (stated in the old currency)
 *   and the cached PVGIS resource.
 *
 * Global / personal (always kept):
 *   roof orientation and tilt, consumption, self-consumption share, accepted
 *   payback time, electricity price scenario, current step.
 */

import { defaultGridProfileFor, getConnectionConfig } from "@/config/connections";
import { PHASE_COUNT_FOR_SERVICE_TYPE, splitPhaseLineToNeutral } from "@/config/grid";
import type { ConnectionCapacity } from "@/config/connection-capacity";
import type { PhaseCount, ServiceType } from "@/config/grid";

export interface CountryDependentState {
  connectionCapacity: ConnectionCapacity | null;
  connectionOptionId: string | null;
  connectionSource: "country-option" | "custom" | null;
  mainFuseAmp: number | null;
  gridPhaseCount: PhaseCount;
  gridServiceType: ServiceType;
  gridVoltageV: number;
  gridLineToNeutralVoltageV: number | null;
  gridFrequencyHz: number;
  gridProfileIsUserSet: boolean;
  gridConfirmed: boolean;
  selfConsumedValuePerKwh: number | null;
  exportValuePerKwh: number | null;
  quotePrice: number | null;
}

/** Country codes compared case-insensitively; null/"" means "unknown". */
export function isSameCountry(a?: string | null, b?: string | null): boolean {
  return (a ?? "").toUpperCase() === (b ?? "").toUpperCase();
}

/**
 * The country-dependent state a given country starts from. Pure — the store
 * only spreads the result.
 */
export function countryDefaults(countryCode?: string | null): CountryDependentState {
  const connection = getConnectionConfig(countryCode);
  const profile = defaultGridProfileFor(connection);
  const lineToNeutral =
    profile.lineToNeutralVoltageV ??
    (profile.serviceType === "split-phase" ? splitPhaseLineToNeutral(profile.voltageV) : null);

  return {
    connectionCapacity: null,
    connectionOptionId: null,
    connectionSource: null,
    mainFuseAmp: null,
    gridPhaseCount: PHASE_COUNT_FOR_SERVICE_TYPE[profile.serviceType],
    gridServiceType: profile.serviceType,
    gridVoltageV: profile.voltageV,
    gridLineToNeutralVoltageV: lineToNeutral,
    gridFrequencyHz: profile.frequencyHz,
    gridProfileIsUserSet: false,
    // A non-verified profile must be confirmed by the user; a verified one
    // needs no confirmation.
    gridConfirmed: connection.status === "verified",
    selfConsumedValuePerKwh: null,
    exportValuePerKwh: null,
    quotePrice: null,
  };
}
