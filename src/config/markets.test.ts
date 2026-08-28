import { describe, expect, it } from "vitest";
import {
  ACTIVE_MARKET_CODES,
  MARKETS,
  getMarketConfig,
  isActiveMarket,
} from "./markets";
import { EU_GRID_PHASES, EU_GRID_VOLTAGE_V } from "./constants";
import { maxAcPowerFromFuse } from "@/lib/calc/inverter-sizing";

const EXPECTED_KW_PER_AMP = [
  [16, 11.0],
  [20, 13.8],
  [25, 17.3],
  [35, 24.2],
  [50, 34.5],
  [63, 43.5],
] as const;

describe("supported markets", () => {
  it("supports exactly the 13 active countries", () => {
    expect(ACTIVE_MARKET_CODES).toHaveLength(13);
    for (const code of ACTIVE_MARKET_CODES) {
      expect(MARKETS[code]).toBeDefined();
    }
  });

  it("no longer supports Croatia", () => {
    expect(MARKETS["HR"]).toBeUndefined();
    expect(isActiveMarket("HR")).toBe(false);
    // A Croatian address may never silently activate a Croatian market.
    expect(getMarketConfig("HR").countryCode).not.toBe("HR");
  });

  it("uses the same 400 V three-phase assumption in every active market", () => {
    for (const code of ACTIVE_MARKET_CODES) {
      const market = MARKETS[code]!;
      expect(market.kwPerAmp).toBe(0.69);
      expect(market.gridVoltageV).toBe(EU_GRID_VOLTAGE_V);
      expect(market.gridPhases).toBe(EU_GRID_PHASES);

      for (const [amp, expected] of EXPECTED_KW_PER_AMP) {
        expect(maxAcPowerFromFuse(amp, market.kwPerAmp)).toBeCloseTo(expected, 1);
      }
    }
  });

  it("matches the sqrt(3) x 400 V x A model", () => {
    for (const [amp, expected] of EXPECTED_KW_PER_AMP) {
      const theoretical = (Math.sqrt(3) * EU_GRID_VOLTAGE_V * amp) / 1000;
      expect(Math.abs(theoretical - expected)).toBeLessThan(0.6);
    }
  });
});
