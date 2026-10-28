import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdMobCoordinator, type AdAdapter, AD_MAX_AGE_MS } from "./admob-coordinator";
import type { NativeConsent } from "./admob-native";
const consent: NativeConsent = { status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED" };
const deferred = <T,>() => { let resolve: (value: T) => void = () => undefined; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
function fixture() {
  const ad: AdAdapter = {
    premium: vi.fn(async () => false), consentUpdate: vi.fn(async () => ({ ...consent })),
    consentSnapshot: vi.fn(async () => ({ ...consent })), consentForm: vi.fn(async () => ({ ...consent })),
    privacyForm: vi.fn(async () => undefined), tracking: vi.fn(async () => "denied"), requestTracking: vi.fn(async () => undefined),
    initialize: vi.fn(async () => undefined), load: vi.fn(async () => undefined), show: vi.fn(async () => undefined),
    invalidate: vi.fn(async () => undefined), setEligible: vi.fn(async () => undefined),
    state: vi.fn(async () => ({ loadedAt: Date.now(), foreground: true })), eligible: vi.fn(() => true),
    listen: vi.fn(async () => () => undefined),
  };
  return { ad, flow: new AdMobCoordinator(ad) };
}
async function flush() { for (let i = 0; i < 35; i++) await Promise.resolve(); }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000000); vi.spyOn(console, "info").mockImplementation(() => undefined); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("cold-start ad orchestration", () => {
  it("one load and show per cold start, including duplicate calls and return", async () => {
    const { flow, ad } = fixture(); await Promise.all([flow.start(), flow.start()]); await flow.start();
    expect(ad.load).toHaveBeenCalledTimes(1); expect(ad.show).toHaveBeenCalledTimes(1);
  });
  it("Premium performs no UMP, ATT, init or ad request", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.premium).mockResolvedValue(true); await flow.start();
    for (const fn of [ad.consentUpdate, ad.tracking, ad.requestTracking, ad.initialize, ad.load, ad.show]) expect(fn).not.toHaveBeenCalled();
  });
  it("unknown Premium never becomes free", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.premium).mockResolvedValue(null); await flow.start();
    expect(ad.consentUpdate).not.toHaveBeenCalled(); expect(ad.load).not.toHaveBeenCalled();
  });
  it("Premium network error stops advertising", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.premium).mockRejectedValue(new Error("offline")); await flow.start();
    expect(ad.consentUpdate).not.toHaveBeenCalled(); expect(ad.show).not.toHaveBeenCalled();
  });
  it("Premium activated during loading prevents show", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.premium).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await flow.start(); expect(ad.load).toHaveBeenCalledTimes(1); expect(ad.show).not.toHaveBeenCalled();
  });
  it("new-install consent form runs before init without consuming 5-second window", async () => {
    const { flow, ad } = fixture(); const form = deferred<NativeConsent>();
    vi.mocked(ad.consentUpdate).mockResolvedValue({ ...consent, status: "REQUIRED", canRequestAds: false, isConsentFormAvailable: true });
    vi.mocked(ad.consentForm).mockReturnValue(form.promise);
    const run = flow.start(); await flush(); await vi.advanceTimersByTimeAsync(9000);
    expect(ad.initialize).not.toHaveBeenCalled(); form.resolve(consent); await run;
    expect(ad.show).toHaveBeenCalledTimes(1);
  });
  it("rejecting consent blocks load and init", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.consentUpdate).mockResolvedValue({ ...consent, canRequestAds: false });
    await flow.start(); expect(ad.initialize).not.toHaveBeenCalled(); expect(ad.show).not.toHaveBeenCalled();
  });
  it("UMP error uses explicitly permitted native saved consent", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.consentUpdate).mockRejectedValue(new Error("UMP offline"));
    await flow.start(); expect(ad.consentSnapshot).toHaveBeenCalled(); expect(ad.show).toHaveBeenCalledTimes(1);
  });
  it("UMP error does not infer permission from obtained status", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.consentUpdate).mockRejectedValue(new Error("offline"));
    vi.mocked(ad.consentSnapshot).mockResolvedValue({ ...consent, canRequestAds: false });
    await flow.start(); expect(ad.load).not.toHaveBeenCalled();
  });
  it("form failure uses native eligibility, not application cache", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.consentUpdate).mockResolvedValue({ ...consent, status: "REQUIRED", isConsentFormAvailable: true });
    vi.mocked(ad.consentForm).mockRejectedValue(new Error("form failed")); vi.mocked(ad.consentSnapshot).mockResolvedValue({ ...consent, canRequestAds: false });
    await flow.start(); expect(ad.load).not.toHaveBeenCalled();
  });
  it("ATT denial does not block requests or invoke a second ATT prompt", async () => {
    const { flow, ad } = fixture(); await flow.start(); expect(ad.tracking).toHaveBeenCalledTimes(1); expect(ad.show).toHaveBeenCalledTimes(1);
  });
  it.each(["navigation", "interaction", "background"])("%s invalidates pending load permanently", async (reason) => {
    const { flow, ad } = fixture(); const load = deferred<void>(); vi.mocked(ad.load).mockReturnValue(load.promise);
    const run = flow.start(); await flush(); flow.cancel(reason); load.resolve(); await run; await flow.start();
    expect(ad.show).not.toHaveBeenCalled(); expect(ad.setEligible).toHaveBeenCalledWith(false); expect(ad.invalidate).toHaveBeenCalled();
  });
  it("actual foreground false stops native presentation", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.state).mockResolvedValue({ loadedAt: Date.now(), foreground: false });
    await flow.start(); expect(ad.show).not.toHaveBeenCalled();
  });
  it("changed consent clears pending/cached ads and stops show", async () => {
    const { flow, ad } = fixture(); const load = deferred<void>(); vi.mocked(ad.load).mockReturnValue(load.promise);
    const run = flow.start(); await flush(); await flow.changePrivacy(); load.resolve(); await run;
    expect(ad.privacyForm).toHaveBeenCalledTimes(1); expect(ad.invalidate).toHaveBeenCalled(); expect(ad.show).not.toHaveBeenCalled();
  });
  it("current native consent is rechecked immediately before show", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.consentSnapshot).mockResolvedValueOnce(consent).mockResolvedValue({ ...consent, canRequestAds: false });
    await flow.start(); expect(ad.load).toHaveBeenCalledTimes(1); expect(ad.show).not.toHaveBeenCalled();
  });
  it("five-second load timeout invalidates late callback with no retry", async () => {
    const { flow, ad } = fixture(); const load = deferred<void>(); vi.mocked(ad.load).mockReturnValue(load.promise);
    const run = flow.start(); await flush(); await vi.advanceTimersByTimeAsync(5000); await run; load.resolve(); await flush(); await flow.start();
    expect(ad.show).not.toHaveBeenCalled(); expect(ad.invalidate).toHaveBeenCalled(); expect(ad.load).toHaveBeenCalledTimes(1);
  });
  it("four-hour actual native timestamp is never refreshed by JS", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.state).mockResolvedValue({ loadedAt: Date.now() - AD_MAX_AGE_MS, foreground: true });
    await flow.start(); expect(ad.show).not.toHaveBeenCalled();
  });
  it("slow Premium stops before UMP", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.premium).mockReturnValue(new Promise(() => undefined));
    const run = flow.start(); await vi.advanceTimersByTimeAsync(15000); await run; expect(ad.consentUpdate).not.toHaveBeenCalled();
  });
  it("overlapping consent refresh requests coalesce", async () => {
    const { flow, ad } = fixture(); const pending = deferred<NativeConsent>(); vi.mocked(ad.consentUpdate).mockReturnValue(pending.promise);
    const a = flow.refreshConsent(); const b = flow.refreshConsent(); await flush(); expect(ad.consentUpdate).toHaveBeenCalledTimes(1);
    pending.resolve(consent); await Promise.all([a, b]);
  });
  it("consent timeout never opens an overlapping native form", async () => {
    const { flow, ad } = fixture(); const pending = deferred<NativeConsent>(); vi.mocked(ad.consentUpdate).mockReturnValue(pending.promise);
    const first = flow.refreshConsent().catch(() => undefined); await vi.advanceTimersByTimeAsync(15000); await first;
    const change = flow.changePrivacy(); await flush(); expect(ad.privacyForm).not.toHaveBeenCalled();
    pending.resolve(consent); await change; expect(ad.privacyForm).toHaveBeenCalledTimes(1);
  });
  it("privacy double taps share one form", async () => {
    const { flow, ad } = fixture(); await Promise.all([flow.changePrivacy(), flow.changePrivacy()]); expect(ad.privacyForm).toHaveBeenCalledTimes(1);
  });
  it("no-fill does not show or cause repeated requests", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.load).mockRejectedValue(new Error("no-fill")); await flow.start(); await flow.start();
    expect(ad.show).not.toHaveBeenCalled(); expect(ad.load).toHaveBeenCalledTimes(1);
  });
  it("cancellation during native invalidation never re-enables presentation", async () => {
    const { flow, ad } = fixture(); const clear = deferred<void>();
    vi.mocked(ad.invalidate).mockReturnValueOnce(clear.promise);
    const run = flow.start(); await flush(); flow.cancel("privacy_changed"); clear.resolve(); await run;
    expect(ad.setEligible).not.toHaveBeenCalledWith(true); expect(ad.load).not.toHaveBeenCalled();
  });
  it("consent-owned temporary inactivity waits for foreground without cancelling", async () => {
    const { flow, ad } = fixture(); let active = true;
    vi.mocked(ad.eligible).mockImplementation(() => active);
    vi.mocked(ad.consentUpdate).mockResolvedValue({ ...consent, status: "REQUIRED", isConsentFormAvailable: true });
    vi.mocked(ad.consentForm).mockImplementation(async () => { active = false; return consent; });
    ad.waitForeground = vi.fn(async () => { active = true; });
    await flow.start(); expect(ad.waitForeground).toHaveBeenCalled(); expect(ad.show).toHaveBeenCalledTimes(1);
  });
  it("fresh ATT is requested once only after the UMP form completes", async () => {
    const { flow, ad } = fixture(); const form = deferred<NativeConsent>();
    vi.mocked(ad.tracking).mockResolvedValue("notDetermined");
    vi.mocked(ad.consentUpdate).mockResolvedValue({ ...consent, status: "REQUIRED", isConsentFormAvailable: true });
    vi.mocked(ad.consentForm).mockReturnValue(form.promise);
    const run = flow.start(); await flush(); expect(ad.requestTracking).not.toHaveBeenCalled();
    form.resolve(consent); await run; await flow.start();
    expect(ad.requestTracking).toHaveBeenCalledTimes(1);
    expect(ad.initialize).toHaveBeenCalledTimes(1);
  });
  it.each(["authorized", "denied", "restricted", "not_applicable"])("%s never triggers ATT", async (status) => {
    const { flow, ad } = fixture(); vi.mocked(ad.tracking).mockResolvedValue(status);
    await flow.start(); expect(ad.requestTracking).not.toHaveBeenCalled(); expect(ad.show).toHaveBeenCalledTimes(1);
  });
  it("Premium activation before ATT prevents the system prompt", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.tracking).mockResolvedValue("notDetermined");
    vi.mocked(ad.premium).mockResolvedValueOnce(false).mockResolvedValue(true);
    await flow.start(); expect(ad.requestTracking).not.toHaveBeenCalled(); expect(ad.load).not.toHaveBeenCalled();
  });
  it("privacy options wait for actual ATT completion and never cause an ad", async () => {
    const { flow, ad } = fixture(); const att = deferred<void>(); vi.mocked(ad.tracking).mockResolvedValue("notDetermined");
    ad.requestTracking = vi.fn(() => att.promise);
    const run = flow.start(); await flush(); const change = flow.changePrivacy(); await flush();
    expect(ad.privacyForm).not.toHaveBeenCalled(); att.resolve(); await Promise.all([run, change]);
    expect(ad.privacyForm).toHaveBeenCalledTimes(1); expect(ad.initialize).not.toHaveBeenCalled();
  });
  it("ATT native failure stops init instead of overlapping dialogs", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.tracking).mockResolvedValue("notDetermined");
    ad.requestTracking = vi.fn(async () => { throw new Error("inactive"); });
    await flow.start(); expect(ad.initialize).not.toHaveBeenCalled(); expect(ad.show).not.toHaveBeenCalled();
  });
  it("ATT timeout cannot initialize while the native request is still pending", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.tracking).mockResolvedValue("notDetermined");
    const att = deferred<void>(); ad.requestTracking = vi.fn(() => att.promise);
    const run = flow.start(); await flush(); await vi.advanceTimersByTimeAsync(15000); await run;
    expect(ad.initialize).not.toHaveBeenCalled(); att.resolve(); await flush(); expect(ad.show).not.toHaveBeenCalled();
  });
  it("read-only settings query reads native values without any consent process", async () => {
    const { flow, ad } = fixture(); const result = await flow.readPrivacy();
    expect(result).toEqual({ consent, tracking: "denied" });
    expect(ad.consentUpdate).not.toHaveBeenCalled(); expect(ad.consentForm).not.toHaveBeenCalled(); expect(ad.requestTracking).not.toHaveBeenCalled();
  });
  it("settings query rejects a native error instead of marking stale data current", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.consentSnapshot).mockRejectedValue(new Error("offline"));
    await expect(flow.readPrivacy()).rejects.toThrow("offline"); expect(ad.consentUpdate).not.toHaveBeenCalled();
  });
  it("changed native consent blocks every new ad request even after init", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.consentSnapshot).mockResolvedValue({ ...consent, canRequestAds: false });
    await flow.start(); expect(ad.load).not.toHaveBeenCalled();
  });
  it("explicit settings refresh recovers unknown UMP after launch cancellation without ads or dialogs", async () => {
    const { flow, ad } = fixture(); flow.cancel("navigation");
    vi.mocked(ad.consentSnapshot).mockResolvedValue({ ...consent, status: "UNKNOWN", privacyOptionsRequirementStatus: "UNKNOWN" });
    expect(await flow.readPrivacy(true)).toEqual({ consent, tracking: "denied" });
    expect(ad.consentUpdate).toHaveBeenCalledTimes(1);
    for (const fn of [ad.consentForm, ad.privacyForm, ad.requestTracking, ad.initialize, ad.load, ad.show]) expect(fn).not.toHaveBeenCalled();
  });
  it.each([true, null])("explicit settings refresh with Premium=%s never starts UMP", async (premium) => {
    const { flow, ad } = fixture(); vi.mocked(ad.premium).mockResolvedValue(premium);
    await expect(flow.readPrivacy(true)).rejects.toThrow("privacy_entitlement_unavailable");
    expect(ad.consentUpdate).not.toHaveBeenCalled();
  });
  it("unknown consent opens the required initial form through the explicit change button", async () => {
    const { flow, ad } = fixture();
    vi.mocked(ad.consentSnapshot).mockResolvedValue({ ...consent, status: "UNKNOWN", privacyOptionsRequirementStatus: "UNKNOWN" });
    vi.mocked(ad.consentUpdate).mockResolvedValue({ ...consent, status: "REQUIRED", isConsentFormAvailable: true });
    await flow.changePrivacy();
    expect(ad.consentUpdate).toHaveBeenCalledTimes(1); expect(ad.consentForm).toHaveBeenCalledTimes(1);
    expect(ad.privacyForm).not.toHaveBeenCalled(); expect(ad.requestTracking).not.toHaveBeenCalled(); expect(ad.load).not.toHaveBeenCalled();
  });
  it("known choices open the Google privacy form without a redundant UMP update", async () => {
    const { flow, ad } = fixture(); await flow.changePrivacy();
    expect(ad.privacyForm).toHaveBeenCalledTimes(1); expect(ad.consentUpdate).not.toHaveBeenCalled();
  });
  it("failed recovery cannot pass unknown consent off as a successful refresh", async () => {
    const { flow, ad } = fixture(); vi.mocked(ad.consentUpdate).mockRejectedValue(new Error("UMP offline"));
    vi.mocked(ad.consentSnapshot).mockResolvedValue({ ...consent, status: "UNKNOWN", privacyOptionsRequirementStatus: "UNKNOWN" });
    await expect(flow.readPrivacy(true)).rejects.toThrow("UMP offline");
    expect(ad.privacyForm).not.toHaveBeenCalled(); expect(ad.show).not.toHaveBeenCalled();
  });
  it.each([true, null])("explicit change with Premium=%s never opens a consent dialog", async (premium) => {
    const { flow, ad } = fixture(); vi.mocked(ad.premium).mockResolvedValue(premium);
    await expect(flow.changePrivacy()).rejects.toThrow("privacy_entitlement_unavailable");
    expect(ad.privacyForm).not.toHaveBeenCalled(); expect(ad.consentForm).not.toHaveBeenCalled(); expect(ad.consentUpdate).not.toHaveBeenCalled();
  });
});