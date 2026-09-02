import { describe, expect, it } from "vitest";
import { getShapeWeights } from "./consumption-shape";

/** Index of the highest weight (0 = January). */
function peakMonth(weights: number[]): number {
  return weights.indexOf(Math.max(...weights));
}

describe("climate-aware default consumption profile", () => {
  it("keeps a winter peak in the cold band", () => {
    const stockholm = getShapeWeights("default", null, 59.3);
    expect([11, 0]).toContain(peakMonth(stockholm));
  });

  it("puts the peak in summer for cooling-dominated markets", () => {
    const seville = getShapeWeights("default", null, 37.4); // Spain
    expect([6, 7]).toContain(peakMonth(seville));
    const dubai = getShapeWeights("default", null, 25.2);
    expect([6, 7]).toContain(peakMonth(dubai));
  });

  it("mirrors the cooling peak for the southern hemisphere", () => {
    const sydney = getShapeWeights("default", null, -33.9);
    // Southern summer: December/January.
    expect([0, 1, 11]).toContain(peakMonth(sydney));
  });

  it("is nearly flat in the tropics", () => {
    const singapore = getShapeWeights("default", null, 1.35);
    expect(Math.max(...singapore) - Math.min(...singapore)).toBeLessThan(0.02);
  });

  it("always sums to one", () => {
    for (const lat of [59, 45, 37, 25, 5, -33, -45, null]) {
      const sum = getShapeWeights("default", null, lat).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });
});
