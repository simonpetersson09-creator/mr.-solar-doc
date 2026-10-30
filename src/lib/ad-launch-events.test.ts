import { describe, expect, it, vi } from "vitest";
import { AdLaunchTelemetry } from "./ad-launch-events";

describe("app-open outcome telemetry", () => {
  it("deduplicates native opens and impressions, never records a later skip", () => {
    const send = vi.fn(); const telemetry = new AdLaunchTelemetry(send);
    telemetry.start(); telemetry.start(); telemetry.record("show_attempt");
    telemetry.record("opened"); telemetry.record("opened");
    telemetry.record("impression"); telemetry.record("impression");
    telemetry.record("error", "show_failed"); telemetry.finish(); telemetry.finish();
    expect(send.mock.calls.flat()).toEqual(["ad_open_started", "ad_open_shown", "ad_open_impression"]);
  });
  it("never mistakes a show attempt for a confirmed open", () => {
    const send = vi.fn(); const t = new AdLaunchTelemetry(send); t.start(); t.record("show_attempt"); t.finish();
    expect(send.mock.calls.flat()).toEqual(["ad_open_started", "ad_open_unconfirmed"]);
  });
  it.each([
    ["cancelled", "interaction", "interaction"], ["cancelled", "navigation", "navigation"],
    ["cancelled", "wizard_resumed", "wizard_resumed"], ["cancelled", "background_unknown", "background"],
    ["cancelled", "privacy_refresh", "privacy_action"], ["premium", "active", "premium"],
    ["premium", "unknown", "premium_unknown"], ["skipped", "consent_missing", "consent_unavailable"],
    ["error", "timeout:load", "timeout"], ["failed_load", "no_fill", "no_fill"],
    ["error", "load_failed", "load_error"], ["failed_show", undefined, "show_error"],
  ])("maps %s/%s to a bounded reason %s", (stage, reason, expected) => {
    const send = vi.fn(); const t = new AdLaunchTelemetry(send); t.start(); t.record(stage, reason); t.finish();
    expect(send.mock.calls.flat()).toEqual(["ad_open_started", `ad_open_skipped_${expected}`]);
  });
  it("ignores errors from telemetry transport", () => {
    const t = new AdLaunchTelemetry(() => { throw new Error("offline"); });
    expect(() => { t.start(); t.record("opened"); t.finish(); }).not.toThrow();
  });
  it("never uploads raw errors, tracking status or purpose consent strings", () => {
    const send = vi.fn(); const t = new AdLaunchTelemetry(send); t.start();
    t.record("tracking", "authorized"); t.record("consent_update", "1001"); t.record("error", "secret raw error"); t.finish();
    expect(send.mock.calls.flat()).toEqual(["ad_open_started", "ad_open_skipped_native_error"]);
  });
});