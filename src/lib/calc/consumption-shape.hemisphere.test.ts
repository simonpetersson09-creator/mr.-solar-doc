import { describe, expect, it } from "vitest";
import { getShapeWeights } from "./consumption-shape";

describe("hemisphere-aware consumption shapes", () => {
  it("keeps the northern shape north of the equator", () => {
    const north = getShapeWeights("winter-heavy", null, 59);
    expect(Math.max(...north)).toBe(north[0]);
  });

  it("shifts the peak six months south of the equator", () => {
    const north = getShapeWeights("winter-heavy", null, 59);
    const south = getShapeWeights("winter-heavy", null, -33);
    south.forEach((w, i) => expect(w).toBeCloseTo(north[(i + 6) % 12]!, 10));
    expect(Math.max(...south)).toBeCloseTo(south[6]!, 10);
  });

  it("flattens the shape in the equatorial band", () => {
    const equator = getShapeWeights("winter-heavy", null, 1);
    const spread = Math.max(...equator) - Math.min(...equator);
    expect(spread).toBeLessThan(0.02);
  });

  it("always sums to one", () => {
    for (const lat of [59, -33, 0, -12, null]) {
      const sum = getShapeWeights("default", null, lat).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });
});
