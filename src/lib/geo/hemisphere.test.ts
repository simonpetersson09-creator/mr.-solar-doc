import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  defaultCompassAzimuthForLatitude,
  defaultPvgisAzimuthForLatitude,
  getHemisphere,
} from "./hemisphere";

const fetchPvgis = vi.fn();
vi.mock("@/lib/pvgis.functions", () => ({
  fetchPvgis: (args: unknown) => fetchPvgis(args),
}));

import { getSolarResource } from "@/services/solar-resource-service";

describe("hemisphere", () => {
  it("maps positive latitude to the northern hemisphere and a southern default", () => {
    expect(getHemisphere(59.3)).toBe("north");
    expect(defaultCompassAzimuthForLatitude(59.3)).toBe(180);
    expect(defaultPvgisAzimuthForLatitude(59.3)).toBe(0);
  });

  it("maps negative latitude to the southern hemisphere and a northern default", () => {
    expect(getHemisphere(-33.9)).toBe("south");
    expect(defaultCompassAzimuthForLatitude(-33.9)).toBe(0);
    // PVGIS convention: 0 = south, 180 = north.
    expect(defaultPvgisAzimuthForLatitude(-33.9)).toBe(180);
  });

  it("makes no direction assumption near the equator", () => {
    expect(getHemisphere(1.2)).toBe("equatorial");
    expect(defaultCompassAzimuthForLatitude(1.2)).toBeNull();
    expect(defaultPvgisAzimuthForLatitude(1.2)).toBeNull();
  });
});

describe("solar resource orientation", () => {
  beforeEach(() => {
    fetchPvgis.mockReset();
    fetchPvgis.mockResolvedValue({
      annualKwhPerKwp: 950,
      monthlyKwhPerKwp: Array(12).fill(79),
      dataSource: "PVGIS test",
      optimalTiltUsed: false,
      tiltDegrees: 30,
    });
  });

  const base = { latitude: 59.3, longitude: 18.1, tiltDegrees: 30 };

  it("sends the Swedish default (south) unchanged", async () => {
    await getSolarResource({ ...base, orientation: "unknown" });
    expect(fetchPvgis.mock.calls[0]![0].data.azimuth).toBe(0);
  });

  it("sends north for a southern-hemisphere location", async () => {
    await getSolarResource({ ...base, latitude: -33.9, orientation: "unknown" });
    expect(fetchPvgis.mock.calls[0]![0].data.azimuth).toBe(180);
  });

  it("lets PVGIS decide near the equator", async () => {
    await getSolarResource({ ...base, latitude: 0.5, orientation: "unknown" });
    expect(fetchPvgis.mock.calls[0]![0].data.azimuth).toBeNull();
  });

  it("gives the user's own orientation precedence over the hemisphere default", async () => {
    await getSolarResource({ ...base, latitude: -33.9, orientation: "east" });
    expect(fetchPvgis.mock.calls[0]![0].data.azimuth).toBe(-90);

    fetchPvgis.mockClear();
    await getSolarResource({
      ...base,
      latitude: -33.9,
      orientation: "south",
      azimuthDegrees: 200,
    });
    expect(fetchPvgis.mock.calls[0]![0].data.azimuth).toBe(20);
  });
});
