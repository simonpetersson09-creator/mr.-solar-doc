import { describe, expect, it } from "vitest";
import { formatInverterPower } from "./inverter-display";

describe("formatInverterPower", () => {
  it("keeps the decimal of real product sizes instead of rounding 9.6 kW to 10 kW", () => {
    expect(formatInverterPower({ inverterKw: 9.6 }, "en")).toBe("9.6 kW");
    expect(formatInverterPower({ inverterKw: 3.8 }, "sv")).toBe("3,8 kW");
    expect(formatInverterPower({ inverterKw: 5 }, "en")).toBe("5 kW");
    expect(formatInverterPower({ inverterKw: 22.8, inverterUnitKw: 11.4, inverterUnitCount: 2 }, "en")).toBe("2 × 11.4 kW");
  });
});
