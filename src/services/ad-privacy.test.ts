import { afterEach, beforeEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  platform: "ios", snapshot: vi.fn(), tracking: vi.fn(), update: vi.fn(), form: vi.fn(), invalidate: vi.fn(), eligible: vi.fn(), state: vi.fn(),
}));
vi.mock("@/services/native-service", () => ({ getPlatform: () => native.platform, isNativePlatform: () => native.platform !== "web" }));
vi.mock("./admob-native", () => ({ adMobSafety: { getConsentSnapshot: native.snapshot, invalidateAppOpen: native.invalidate, setAppOpenEligible: native.eligible, getAppOpenState: native.state } }));
vi.mock("@capacitor-community/admob", () => ({ AdMob: { trackingAuthorizationStatus: native.tracking, requestConsentInfo: native.update, showPrivacyOptionsForm: native.form } }));
beforeEach(() => {
  vi.resetModules(); native.platform = "ios"; vi.clearAllMocks();
  native.snapshot.mockResolvedValue({ status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED" });
  native.tracking.mockResolvedValue({ status: "restricted" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(["ios", "android"])("%s production diagnostics remain hidden unless native confirms Debug", async (platform) => {
  native.platform = platform; vi.stubEnv("DEV", false);
  const { privacyDiagnosticsAvailable } = await import("./app-open-ad");
  native.state.mockResolvedValue({ testBuild: false });
  expect(await privacyDiagnosticsAvailable()).toBe(false);
  native.state.mockResolvedValue({});
  expect(await privacyDiagnosticsAvailable()).toBe(false);
  native.state.mockRejectedValue(new Error("native unavailable"));
  expect(await privacyDiagnosticsAvailable()).toBe(false);
  native.state.mockResolvedValue({ testBuild: true });
  expect(await privacyDiagnosticsAvailable()).toBe(true);
});
it.each([
  [{ consent: "REQUIRED", optionsStatus: "NOT_REQUIRED", isConsentFormAvailable: true }, true],
  [{ consent: "REQUIRED", optionsStatus: "NOT_REQUIRED", isConsentFormAvailable: false }, false],
  [{ consent: "REQUIRED", optionsStatus: "NOT_REQUIRED" }, false],
  [{ consent: "REQUIRED", optionsStatus: "REQUIRED" }, true],
  [{ consent: "OBTAINED", optionsStatus: "REQUIRED" }, true],
  [{ consent: "UNKNOWN", optionsStatus: "UNKNOWN" }, true],
  [{ consent: "UNKNOWN", optionsStatus: "NOT_REQUIRED" }, true],
  [{ consent: "OBTAINED", optionsStatus: "NOT_REQUIRED" }, false],
  [{ consent: "NOT_REQUIRED", optionsStatus: "NOT_REQUIRED" }, false],
  [null, true],
] as const)("show and change choices share UMP form eligibility for %j: %s", async (state, expected) => {
  const { canOpenPrivacyForm } = await import("./app-open-ad");
  expect(canOpenPrivacyForm(state)).toBe(expected);
});
it("obtained consent and authorized ATT never establish personalization", async () => {
  native.tracking.mockResolvedValue({ status: "authorized" });
  const { getAdPrivacyState } = await import("./app-open-ad");
  const before = Date.now(); const value = await getAdPrivacyState();
  expect(value).toMatchObject({ personalized: "unknown", tracking: "authorized", consent: "OBTAINED", optionsRequired: true });
  expect(value?.checkedAt).toBeGreaterThanOrEqual(before);
  expect(native.update).not.toHaveBeenCalled(); expect(native.form).not.toHaveBeenCalled();
});
it.each(["ios", "android"])("%s reads saved purpose choices without consent updates or forms", async (platform) => {
  native.platform = platform;
  native.snapshot.mockResolvedValue({ status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED", purposeConsents: "1001" });
  const { getAdPrivacyState } = await import("./app-open-ad");
  expect(await getAdPrivacyState()).toMatchObject({ choices: { storage: "allowed", adProfile: "denied", useAdProfile: "allowed" }, personalized: "unknown" });
  native.snapshot.mockResolvedValue({ status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED", purposeConsents: "0110" });
  expect(await getAdPrivacyState()).toMatchObject({ choices: { storage: "denied", adProfile: "allowed", useAdProfile: "denied" } });
  expect(native.update).not.toHaveBeenCalled();
  expect(native.form).not.toHaveBeenCalled();
});
it.each(["ios", "android"])("%s explicit refresh with unavailable startup Premium still exposes fresh saved choices", async (platform) => {
  native.platform = platform;
  native.snapshot.mockResolvedValue({ status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED", purposeConsents: "1001" });
  // No startup resolver is registered: the adapter returns unknown Premium.
  const { getAdPrivacyState } = await import("./app-open-ad");
  expect(await getAdPrivacyState(true)).toMatchObject({ updateFailed: true, choices: { storage: "allowed", adProfile: "denied", useAdProfile: "allowed" } });
  expect(native.update).not.toHaveBeenCalled(); expect(native.form).not.toHaveBeenCalled();
  expect(native.eligible).toHaveBeenCalledWith({ eligible: false });
  expect(native.eligible).not.toHaveBeenCalledWith({ eligible: true });
  native.snapshot.mockResolvedValue({ status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED", purposeConsents: "0110" });
  expect(await getAdPrivacyState()).toMatchObject({ choices: { storage: "denied", adProfile: "allowed", useAdProfile: "denied" } });
  expect(native.snapshot).toHaveBeenCalledTimes(2); expect(native.update).not.toHaveBeenCalled();
});
it("Android never reads the plugin's fictitious ATT authorization", async () => {
  native.platform = "android";
  const { getAdPrivacyState } = await import("./app-open-ad");
  expect(await getAdPrivacyState()).toMatchObject({ platform: "android", tracking: "not_applicable", personalized: "unknown" });
  expect(native.tracking).not.toHaveBeenCalled();
});
it("return from system settings reads updated ATT status rather than JS cache", async () => {
  const { getAdPrivacyState } = await import("./app-open-ad");
  expect((await getAdPrivacyState())?.tracking).toBe("restricted");
  native.tracking.mockResolvedValue({ status: "denied" });
  expect((await getAdPrivacyState())?.tracking).toBe("denied");
});
it("failed native reads never return old data as a successful refresh", async () => {
  const { getAdPrivacyState } = await import("./app-open-ad");
  await getAdPrivacyState(); native.snapshot.mockRejectedValue(new Error("SDK unavailable"));
  await expect(getAdPrivacyState()).rejects.toThrow("SDK unavailable");
});
it("unsupported privacy options never invoke a form", async () => {
  native.snapshot.mockResolvedValue({ status: "NOT_REQUIRED", canRequestAds: true, privacyOptionsRequirementStatus: "NOT_REQUIRED" });
  const { openPrivacyOptions } = await import("./app-open-ad");
  await expect(openPrivacyOptions()).rejects.toThrow("privacy_options_unavailable"); expect(native.form).not.toHaveBeenCalled();
});
it("web settings perform no native consent reads", async () => {
  native.platform = "web";
  const { getAdPrivacyState } = await import("./app-open-ad");
  expect(await getAdPrivacyState()).toBeNull(); expect(native.snapshot).not.toHaveBeenCalled();
});
it.each(["UNKNOWN", "REQUIRED", "OBTAINED", "NOT_REQUIRED"])("F3 every form availability combination for consent %s", async (consent) => {
  const { canOpenPrivacyForm } = await import("./app-open-ad");
  for (const optionsStatus of ["UNKNOWN", "REQUIRED", "NOT_REQUIRED"]) {
    for (const isConsentFormAvailable of [false, true]) {
      const expected = consent === "UNKNOWN" || optionsStatus === "UNKNOWN" || optionsStatus === "REQUIRED" || (consent === "REQUIRED" && isConsentFormAvailable);
      expect(canOpenPrivacyForm({ consent, optionsStatus, isConsentFormAvailable })).toBe(expected);
    }
  }
});