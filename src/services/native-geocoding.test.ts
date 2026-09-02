import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_BACKEND_URL } from "@/config/native-backend";
import {
  NativeGeocodingError,
  createNativeGeocodingRequest,
  executeNativeGeocoding,
  nativeGeocodingDiagnostic,
} from "./native-geocoding";

describe("native geocoding transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds the exact stable search request", () => {
    const request = createNativeGeocodingRequest({
      mode: "search",
      query: "Storgatan 1, Växjö",
      language: "sv",
    });
    const url = new URL(request.url);

    expect(url.origin).toBe(NATIVE_BACKEND_URL);
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe("/api/public/geocode");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: "search",
      language: "sv",
      query: "Storgatan 1, Växjö",
    });
    expect(request.init).toEqual({
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(request.init.body).toBeUndefined();
    expect(request.url).not.toContain("/_serverFn/");
  });

  it("parses the frontend suggestion format after HTTP 200", async () => {
    const suggestion = {
      id: "1",
      label: "Storgatan, Växjö, Sverige",
      latitude: 56.879,
      longitude: 14.77,
      countryCode: "SE",
      region: "Kronobergs län",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([suggestion])));

    await expect(
      executeNativeGeocoding({ mode: "search", query: "Storgatan 1, Växjö", language: "sv" }),
    ).resolves.toEqual([suggestion]);
  });

  it("rejects an unexpected successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));

    await expect(
      executeNativeGeocoding({ mode: "search", query: "Storgatan 1, Växjö", language: "sv" }),
    ).rejects.toMatchObject({ status: "INVALID_RESPONSE" });
  });

  it("exposes a safe diagnostic without the query", () => {
    const error = new NativeGeocodingError(500, "route_missing");
    expect(nativeGeocodingDiagnostic(error)).toBe(
      "/api/public/geocode · 500 · route_missing",
    );
  });
});