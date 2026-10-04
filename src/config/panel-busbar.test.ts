/**
 * US/CA busbar rule with the panel the PV connects to, distinct from the
 * home's total service. NEC 705.12(B)(3)(2) (120 % rule):
 *   125 % x inverter output current + panel main breaker <= 1.2 x busbar
 * CEC 64-112 (dwellings): same structure with 125 % of the busbar.
 */
import { describe, expect, it } from "vitest";
import { getPvConnectionRules, resolvePvPowerLimit } from "./pv-connection-rules";

const ref = (factor: number, busbar: number, main: number) =>
  (Math.max(0, factor * busbar - main) / 1.25) * 240 / 1000;

function us(serviceA: number, main: number | null, busbar: number | null, country = "US") {
  return resolvePvPowerLimit({
    connectionCapacityKw: (240 * serviceA) / 1000,
    rules: getPvConnectionRules(country),
    serviceType: "split-phase",
    serviceAmperageA: serviceA,
    voltageV: 240,
    panelMainBreakerA: main,
    busbarRatingA: busbar,
  });
}

describe("main breaker and busbar equal", () => {
  it.each([100, 125, 150, 200, 225])("%s A / %s A", (a) => {
    const r = us(a, a, a);
    expect(r.busbarLimitKw).toBeCloseTo(ref(1.2, a, a), 9);
    expect(r.busbarBasis?.mainAssumed).toBe(false);
    expect(r.busbarBasis?.busbarAssumed).toBe(false);
  });
  it("200 A unknown details assume equal ratings = 7.68 kW (unchanged default)", () => {
    const r = us(200, null, null);
    expect(r.busbarLimitKw).toBeCloseTo(7.68, 9);
    expect(r.busbarBasis).toMatchObject({ panelMainBreakerA: 200, busbarRatingA: 200, mainAssumed: true, busbarAssumed: true, largeService: false, maxBackfeedBreakerA: 40 });
  });
});

describe("main breaker and busbar different", () => {
  it("200 A main on a 225 A busbar allows 70 A breaker = 13.44 kW", () => {
    const r = us(200, 200, 225);
    expect(r.busbarBasis?.maxBackfeedBreakerA).toBeCloseTo(70, 9);
    expect(r.busbarLimitKw).toBeCloseTo(13.44, 9);
  });
  it("main breaker derated to 175 A on a 200 A busbar = 65 A = 12.48 kW", () => {
    expect(us(200, 175, 200).busbarLimitKw).toBeCloseTo(12.48, 9);
  });
  it("busbar only stated: main assumed = service", () => {
    const r = us(200, null, 225);
    expect(r.busbarBasis?.mainAssumed).toBe(true);
    expect(r.busbarLimitKw).toBeCloseTo(ref(1.2, 225, 200), 9);
  });
  it("busbar smaller than allowed share never goes negative", () => {
    const r = us(200, 200, 150);
    expect(r.busbarBasis?.maxBackfeedBreakerA).toBe(0);
    expect(r.busbarLimitKw).toBe(0);
  });
});

describe("400 A service with different panel layouts", () => {
  it("unknown layout: preliminary 200 A panel, flagged, not a 400 A panel", () => {
    const r = us(400, null, null);
    expect(r.busbarBasis).toMatchObject({ largeService: true, mainAssumed: true, busbarAssumed: true, panelMainBreakerA: 200, busbarRatingA: 200 });
    expect(r.busbarLimitKw).toBeCloseTo(7.68, 9);
    expect(r.connectionCapacityKw).toBeCloseTo(96, 9); // total service stays 400 A
  });
  it("one 400 A panel with 400 A busbar = 80 A = 15.36 kW", () => {
    expect(us(400, 400, 400).busbarLimitKw).toBeCloseTo(15.36, 9);
  });
  it("two 200 A panels, PV on one of them = 7.68 kW", () => {
    const r = us(400, 200, 200);
    expect(r.busbarLimitKw).toBeCloseTo(7.68, 9);
    expect(r.busbarBasis?.mainAssumed).toBe(false);
  });
  it("200 A main on a 225 A busbar in a split 400 A service = 13.44 kW", () => {
    expect(us(400, 200, 225).busbarLimitKw).toBeCloseTo(13.44, 9);
  });
});

describe("Canada uses 125 % of the busbar", () => {
  it("200/200 = 50 A = 9.6 kW", () => expect(us(200, 200, 200, "CA").busbarLimitKw).toBeCloseTo(9.6, 9));
  it("200/225 = 81.25 A", () => expect(us(200, 200, 225, "CA").busbarLimitKw).toBeCloseTo(ref(1.25, 225, 200), 9));
});

describe("markets without a busbar rule ignore panel details", () => {
  it("SE", () => {
    const r = resolvePvPowerLimit({ connectionCapacityKw: 17.3, rules: getPvConnectionRules("SE"), serviceAmperageA: 25, voltageV: 400, panelMainBreakerA: 25, busbarRatingA: 63 });
    expect(r.busbarBasis).toBeNull();
    expect(r.busbarLimitKw).toBeNull();
  });
});
