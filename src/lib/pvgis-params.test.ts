import { describe, expect, it } from "vitest";
import {
  buildPvgisOrientationFallbackRequest,
  buildPvgisRequest,
  fallbackTiltForLatitude,
  isImplausibleOptimalTilt,
  MIN_PLAUSIBLE_OPTIMAL_TILT_DEGREES,
  maxPlausibleOptimalTilt,
} from "./pvgis-params";
import { readDataSource } from "./pvgis-response";
import { describePvgisError, encodePvgisError, extractPvgisMessage } from "./pvgis-error";

const STOCKHOLM = { latitude: 59.33, longitude: 18.07 };
const SYDNEY = { latitude: -33.87, longitude: 151.21 };
const SINGAPORE = { latitude: 1.35, longitude: 103.82 };
const QUITO = { latitude: -0.18, longitude: -78.47 };

describe("PVGIS parameter logic — northern hemisphere", () => {
  it("A: tilt + aspect become explicit angle/aspect without optimisation", () => {
    const plan = buildPvgisRequest({ ...STOCKHOLM, tilt: 30, azimuth: 0 });
    expect(plan.mode).toBe("explicit");
    expect(plan.params.get("angle")).toBe("30");
    expect(plan.params.get("aspect")).toBe("0");
    expect(plan.params.get("optimalangles")).toBeNull();
    expect(plan.params.get("optimalinclination")).toBeNull();
    expect(plan.optimalTiltUsed).toBe(false);
  });

  it("B: aspect without tilt uses optimalinclination, never optimalangles", () => {
    const plan = buildPvgisRequest({ ...STOCKHOLM, tilt: null, azimuth: -45 });
    expect(plan.mode).toBe("optimal-inclination");
    expect(plan.params.get("optimalinclination")).toBe("1");
    expect(plan.params.get("aspect")).toBe("-45");
    expect(plan.params.get("optimalangles")).toBeNull();
    expect(plan.params.get("angle")).toBeNull();
    expect(plan.optimalTiltUsed).toBe(true);
  });

  it("C: tilt without aspect keeps the tilt and defaults to south", () => {
    const plan = buildPvgisRequest({ ...STOCKHOLM, tilt: 27, azimuth: null });
    expect(plan.params.get("angle")).toBe("27");
    expect(plan.params.get("aspect")).toBe("0");
    expect(plan.params.get("optimalangles")).toBeNull();
  });

  it("D: nothing known is the only case using optimalangles", () => {
    const plan = buildPvgisRequest({ ...STOCKHOLM, tilt: null, azimuth: null });
    expect(plan.mode).toBe("optimal-angles");
    expect(plan.params.get("optimalangles")).toBe("1");
  });

  it("keeps the fixed system assumptions unchanged", () => {
    const plan = buildPvgisRequest({ ...STOCKHOLM, tilt: 30, azimuth: 0 });
    expect(plan.params.get("peakpower")).toBe("1");
    expect(plan.params.get("loss")).toBe("14");
    expect(plan.params.get("pvtechchoice")).toBe("crystSi");
    expect(plan.params.get("mountingplace")).toBe("building");
    expect(plan.params.get("outputformat")).toBe("json");
    expect(plan.url.startsWith("https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?")).toBe(true);
  });
});

describe("PVGIS parameter logic — southern hemisphere", () => {
  it("defaults to north when the orientation is unknown", () => {
    const plan = buildPvgisRequest({ ...SYDNEY, tilt: 25, azimuth: null });
    expect(plan.params.get("aspect")).toBe("180");
    expect(plan.params.get("angle")).toBe("25");
  });

  it("never overrides a direction the user supplied", () => {
    const plan = buildPvgisRequest({ ...SYDNEY, tilt: 25, azimuth: 90 });
    expect(plan.params.get("aspect")).toBe("90");
  });
});

describe("PVGIS parameter logic — equatorial band", () => {
  it("Singapore: a user tilt is never replaced by optimisation", () => {
    const plan = buildPvgisRequest({ ...SINGAPORE, tilt: 15, azimuth: null });
    expect(plan.params.get("angle")).toBe("15");
    expect(plan.params.get("aspect")).toBe("0");
    expect(plan.params.get("optimalangles")).toBeNull();
  });

  it("Singapore: aspect only optimises the inclination", () => {
    const plan = buildPvgisRequest({ ...SINGAPORE, tilt: null, azimuth: 45 });
    expect(plan.params.get("optimalinclination")).toBe("1");
    expect(plan.params.get("aspect")).toBe("45");
    expect(plan.params.get("optimalangles")).toBeNull();
  });

  it("Quito: a user tilt is never replaced by optimisation", () => {
    const plan = buildPvgisRequest({ ...QUITO, tilt: 10, azimuth: null });
    expect(plan.params.get("angle")).toBe("10");
    expect(plan.params.get("optimalangles")).toBeNull();
  });

  it("orientation fallback replaces only the orientation parameters", () => {
    const input = { ...SINGAPORE, tilt: null, azimuth: null };
    const fallback = buildPvgisOrientationFallbackRequest(input);
    expect(fallback.params.get("optimalangles")).toBeNull();
    expect(fallback.params.get("angle")).toBe("1");
    expect(fallback.params.get("aspect")).toBe("0");
    expect(fallback.params.get("lat")).toBe(String(SINGAPORE.latitude));
    expect(fallback.params.get("lon")).toBe(String(SINGAPORE.longitude));
    expect(fallback.optimalTiltUsed).toBe(true);
  });

  it("fallback tilt follows latitude and is capped at 35 degrees", () => {
    expect(fallbackTiltForLatitude(0.18)).toBe(0);
    expect(fallbackTiltForLatitude(30)).toBe(30);
    expect(fallbackTiltForLatitude(59.33)).toBe(35);
    expect(fallbackTiltForLatitude(-45)).toBe(35);
  });
});

describe("PVGIS radiation database label", () => {
  it("reads the v5.3 path", () => {
    expect(readDataSource({ inputs: { meteo_data: { radiation_db: "PVGIS-SARAH3" } } })).toBe(
      "PVGIS-SARAH3",
    );
    expect(readDataSource({ inputs: { meteo_data: { radiation_db: "PVGIS-ERA5" } } })).toBe(
      "PVGIS-ERA5",
    );
  });

  it("falls back to the legacy meta path", () => {
    expect(
      readDataSource({ meta: { inputs: { meteo_data: { radiation_db: "PVGIS-SARAH2" } } } }),
    ).toBe("PVGIS-SARAH2");
  });

  it("falls back defensively when the field is missing", () => {
    expect(readDataSource({})).toBe("PVGIS v5.3");
  });
});

describe("PVGIS error messages", () => {
  it("extracts a JSON message", () => {
    expect(extractPvgisMessage('{"message": "Location over the sea"}')).toBe(
      "Location over the sea",
    );
  });

  it("ignores HTML bodies", () => {
    expect(extractPvgisMessage("<html><body>500</body></html>")).toBeNull();
  });

  it("classifies an over-sea message", () => {
    const info = describePvgisError(new Error(encodePvgisError(400, "Location over the sea")));
    expect(info.kind).toBe("over-sea");
    expect(info.message).toBe("Location over the sea");
  });

  it("falls back to a generic error when no message exists", () => {
    const info = describePvgisError(new Error(encodePvgisError(500, null)));
    expect(info.kind).toBe("unknown");
    expect(info.message).toBeNull();
  });

  it("never leaks a non-PVGIS error message", () => {
    const info = describePvgisError(new Error("TypeError: fetch failed at foo.ts:12"));
    expect(info.kind).toBe("unknown");
    expect(info.message).toBeNull();
  });
});

describe("implausible optimal tilt from PVGIS (case D)", () => {
  it("rejects the sentinel slope PVGIS returned for Sydney", () => {
    expect(isImplausibleOptimalTilt(-1, SYDNEY.latitude)).toBe(true);
  });

  it("rejects a flat optimum outside the equatorial zone", () => {
    expect(isImplausibleOptimalTilt(0, SYDNEY.latitude)).toBe(true);
    expect(isImplausibleOptimalTilt(0, STOCKHOLM.latitude)).toBe(true);
  });

  it("accepts a flat optimum near the equator", () => {
    expect(isImplausibleOptimalTilt(0, SINGAPORE.latitude)).toBe(false);
    expect(isImplausibleOptimalTilt(2, QUITO.latitude)).toBe(false);
  });

  it("accepts normal roof tilts everywhere", () => {
    expect(isImplausibleOptimalTilt(34, SYDNEY.latitude)).toBe(false);
    expect(isImplausibleOptimalTilt(42, STOCKHOLM.latitude)).toBe(false);
  });

  it("rejects missing or nonsensical values", () => {
    expect(isImplausibleOptimalTilt(null, SYDNEY.latitude)).toBe(true);
    expect(isImplausibleOptimalTilt(undefined, SYDNEY.latitude)).toBe(true);
    expect(isImplausibleOptimalTilt(Number.NaN, SYDNEY.latitude)).toBe(true);
    expect(isImplausibleOptimalTilt(120, SYDNEY.latitude)).toBe(true);
  });

  it("the fallback used after rejection faces the equator with a real tilt", () => {
    const plan = buildPvgisOrientationFallbackRequest({ ...SYDNEY, tilt: null, azimuth: null });
    expect(plan.params.get("aspect")).toBe("180");
    expect(Number(plan.params.get("angle"))).toBeGreaterThan(
      MIN_PLAUSIBLE_OPTIMAL_TILT_DEGREES,
  maxPlausibleOptimalTilt,
    );
    expect(plan.params.get("optimalangles")).toBeNull();
  });
});

const NAIROBI = { latitude: -1.29, longitude: 36.82 };
const CAPE_TOWN = { latitude: -33.92, longitude: 18.42 };
const SAO_PAULO = { latitude: -23.55, longitude: -46.63 };
const BERLIN = { latitude: 52.52, longitude: 13.41 };

describe("steep implausible optimal tilt (geographic sanity check)", () => {
  it("rejects the near-vertical optimum PVGIS returned for Nairobi", () => {
    // min(60, 1.29 + 25) = 26.29 deg ceiling
    expect(maxPlausibleOptimalTilt(NAIROBI.latitude)).toBeCloseTo(26.29, 2);
    expect(isImplausibleOptimalTilt(89, NAIROBI.latitude)).toBe(true);
  });

  it("keeps the equatorial regressions working", () => {
    expect(isImplausibleOptimalTilt(0, SINGAPORE.latitude)).toBe(false);
    expect(isImplausibleOptimalTilt(1, QUITO.latitude)).toBe(false);
    expect(isImplausibleOptimalTilt(89, SINGAPORE.latitude)).toBe(true);
    expect(isImplausibleOptimalTilt(89, QUITO.latitude)).toBe(true);
  });

  it("caps the ceiling at 60 degrees at high latitudes", () => {
    expect(maxPlausibleOptimalTilt(STOCKHOLM.latitude)).toBe(60);
    expect(isImplausibleOptimalTilt(45, STOCKHOLM.latitude)).toBe(false);
    expect(isImplausibleOptimalTilt(75, STOCKHOLM.latitude)).toBe(true);
    expect(isImplausibleOptimalTilt(38, BERLIN.latitude)).toBe(false);
  });

  it("accepts realistic optima on the southern hemisphere", () => {
    expect(isImplausibleOptimalTilt(30, SYDNEY.latitude)).toBe(false);
    expect(isImplausibleOptimalTilt(29, CAPE_TOWN.latitude)).toBe(false);
    expect(isImplausibleOptimalTilt(21, SAO_PAULO.latitude)).toBe(false);
    expect(isImplausibleOptimalTilt(85, CAPE_TOWN.latitude)).toBe(true);
  });

  it("orients the fallback toward the equator on both hemispheres", () => {
    for (const site of [NAIROBI, CAPE_TOWN, SAO_PAULO, SYDNEY]) {
      const plan = buildPvgisOrientationFallbackRequest({ ...site, tilt: null, azimuth: null });
      expect(Number(plan.params.get("aspect"))).toBe(site.latitude < -5 ? 180 : 0);
      expect(plan.params.get("optimalangles")).toBeNull();
      expect(Number(plan.params.get("angle"))).toBeGreaterThanOrEqual(0);
    }
    for (const site of [STOCKHOLM, BERLIN]) {
      const plan = buildPvgisOrientationFallbackRequest({ ...site, tilt: null, azimuth: null });
      expect(Number(plan.params.get("aspect"))).toBe(0);
    }
  });

  it("never touches a manually supplied tilt or aspect", () => {
    const plan = buildPvgisRequest({ ...NAIROBI, tilt: 25, azimuth: 90 });
    expect(plan.mode).toBe("explicit");
    expect(plan.params.get("angle")).toBe("25");
    expect(plan.params.get("aspect")).toBe("90");
    expect(plan.optimalTiltUsed).toBe(false);
  });
});
