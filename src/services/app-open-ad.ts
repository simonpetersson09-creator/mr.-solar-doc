import { getPlatform, isNativePlatform } from "@/services/native-service";
import { AdMobCoordinator, AD_MAX_AGE_MS } from "./admob-coordinator";
import { adMobSafety, type NativeConsent } from "./admob-native";
import { recordAdDiagnostic as log } from "./ad-diagnostics";
import { readAdConsentChoices, type AdConsentChoices } from "@/lib/ad-consent-choices";

/** Production ids (iOS only). */
export const ADMOB_IOS_APP_ID = "ca-app-pub-7448540924654868~3473619726";
export const ADMOB_IOS_APP_OPEN_PROD = "ca-app-pub-7448540924654868/9231756595";
/** Google's official iOS App Open demo unit. */
export const ADMOB_IOS_APP_OPEN_TEST = "ca-app-pub-3940256099942544/5575463023";
/** Production ids (Android). The app id lives in AndroidManifest.xml. */
export const ADMOB_ANDROID_APP_ID = "ca-app-pub-7448540924654868~4461725777";
export const ADMOB_ANDROID_APP_OPEN_PROD = "ca-app-pub-7448540924654868/4862935040";
/** Google's official Android App Open demo unit. */
export const ADMOB_ANDROID_APP_OPEN_TEST = "ca-app-pub-3940256099942544/9257395921";

export type AdPlatform = "ios" | "android";

export function appOpenAdUnitId(isProduction: boolean, platform: AdPlatform = "ios"): string {
  if (platform === "android") return isProduction ? ADMOB_ANDROID_APP_OPEN_PROD : ADMOB_ANDROID_APP_OPEN_TEST;
  return isProduction ? ADMOB_IOS_APP_OPEN_PROD : ADMOB_IOS_APP_OPEN_TEST;
}


export function adPlatform(): AdPlatform | null {
  if (!isNativePlatform()) return null;
  const platform = getPlatform();
  return platform === "ios" || platform === "android" ? platform : null;
}
export function adsSupported(): boolean { return adPlatform() !== null; }
export function shouldShowAppOpen(s: { alreadyShown: boolean; userEnteredApp: boolean; premium: boolean; canRequestAds: boolean; loadedAt: number | null; now: number }): boolean {
  if (s.alreadyShown || s.userEnteredApp || s.premium || !s.canRequestAds || s.loadedAt === null) return false;
  const age = s.now - s.loadedAt;
  return age >= 0 && age < AD_MAX_AGE_MS;
}
let coordinator: AdMobCoordinator | undefined;
let startupPremium: (() => Promise<boolean | null>) | undefined;
let entered = false;
let pathname = "/";
let foreground = true;
let sdkPromise: Promise<typeof import("@capacitor-community/admob")> | undefined;
let unitId: string | undefined;
let nativeReady = false;
const sdk = () => sdkPromise ??= import("@capacitor-community/admob");
const allowed = () => !entered && pathname === "/" && foreground && document.visibilityState === "visible";

async function currentUnit(): Promise<string> {
  if (unitId) return unitId;
  const platform = adPlatform();
  if (!platform) throw new Error("native_only");
  const state = await adMobSafety.getAppOpenState({ adId: appOpenAdUnitId(false, platform) });
  nativeReady = true;
  unitId = appOpenAdUnitId(import.meta.env.PROD && !state.testBuild, platform);
  return unitId;
}

function instance(): AdMobCoordinator {
  if (coordinator) return coordinator;
  coordinator = new AdMobCoordinator({
    premium: async () => startupPremium ? startupPremium() : null,
    eligible: allowed,
    consentUpdate: async () => (await sdk()).AdMob.requestConsentInfo(),
    consentSnapshot: () => adMobSafety.getConsentSnapshot(),
    consentForm: async () => (await sdk()).AdMob.showConsentForm(),
    privacyForm: async () => { await (await sdk()).AdMob.showPrivacyOptionsForm(); },
    tracking: async () => adPlatform() === "ios" ? String((await (await sdk()).AdMob.trackingAuthorizationStatus()).status) : "not_applicable",
    requestTracking: async () => { if (adPlatform() === "ios") await adMobSafety.requestTrackingAuthorizationExplicit(); },
    waitForeground: async () => {
      const { App } = await import("@capacitor/app");
      const until = Date.now() + 15000;
      while (!(await App.getState()).isActive) {
        if (entered || Date.now() >= until) throw new Error("timeout:foreground");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      foreground = true;
    },
    initialize: async () => {
      const adId = await currentUnit();
      const testing = adId === appOpenAdUnitId(false, adPlatform() ?? "ios");
      await (await sdk()).AdMob.initialize({ initializeForTesting: testing });
    },
    load: async () => { await (await sdk()).AdMob.loadAppOpen({ adId: await currentUnit() }); },
    show: async () => { await (await sdk()).AdMob.showAppOpen({ adId: await currentUnit() }); },
    invalidate: async () => { await adMobSafety.invalidateAppOpen(); },
    setEligible: async (eligible) => { await adMobSafety.setAppOpenEligible({ eligible: eligible && allowed() }); },
    state: async () => adMobSafety.getAppOpenState({ adId: await currentUnit() }),
    listen: async (event) => {
      const { AdMob, AppOpenAdPluginEvents: events } = await sdk();
      const handles = await Promise.all([
        AdMob.addListener(events.Loaded, () => event("loaded")),
        AdMob.addListener(events.Opened, () => event("opened")),
        AdMob.addListener(events.Closed, () => event("closed")),
        AdMob.addListener(events.FailedToLoad, (data) => event("failed_load", data.code)),
        AdMob.addListener(events.FailedToShow, (data) => event("failed_show", data.code)),
        AdMob.addListener(events.AdImpression, () => event("impression")),
      ]);
      return () => { for (const handle of handles) void handle.remove(); };
    },
  });
  return coordinator;
}

export function setAdLaunchPath(path: string): void {
  pathname = path;
  if (path !== "/") markAdInteraction("navigation");
}
export function markAdInteraction(reason = "interaction"): void {
  entered = true;
  coordinator?.cancel(reason);
}

export function startAppOpenAd(isPremium: () => Promise<boolean | null>): void {
  if (!adsSupported() || startupPremium) return;
  startupPremium = isPremium;
  pathname = window.location.pathname;
  for (const event of ["pointerdown", "keydown", "click", "wheel", "touchstart"]) {
    window.addEventListener(event, () => markAdInteraction(), { capture: true, once: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void checkBackground();
  });
  const checkBackground = async () => {
    foreground = false;
    if (adPlatform() === "ios") {
      try {
        const state = await adMobSafety.getAppOpenState({ adId: appOpenAdUnitId(false, "ios") });
        if (state.background) markAdInteraction("background");
      } catch { markAdInteraction("background_unknown"); }
    } else markAdInteraction("background");
  };
  void (async () => {
    try {
      const { App } = await import("@capacitor/app");
      // iOS pause means actual background; resign-active can just be ATT.
      await App.addListener("pause", () => markAdInteraction("background"));
      await App.addListener("appStateChange", ({ isActive }) => {
        foreground = isActive;
        if (!isActive) void checkBackground();
        else window.dispatchEvent(new Event("adprivacyrefresh"));
      });
      foreground = (await App.getState()).isActive;
      if (!foreground) markAdInteraction("background");
      await instance().start();
    } catch { log("error", nativeReady ? "startup_failed" : "native_setup_failed"); }
  })();
}

export type AdPrivacyState = { platform: AdPlatform; optionsRequired: boolean; optionsStatus: string; consent: string; canRequestAds: boolean; tracking: string; personalized: "unknown"; choices: AdConsentChoices; checkedAt: number };
/** Unknown status is recoverable; REQUIRED consent may need the initial UMP form. */
export function canOpenPrivacyForm(state: Pick<AdPrivacyState, "optionsStatus" | "consent"> | null): boolean {
  return !(state?.optionsStatus === "NOT_REQUIRED" && state.consent !== "REQUIRED");
}
let privacyRead: Promise<AdPrivacyState | null> | undefined;
function privacyState(info: NativeConsent, platform: AdPlatform, tracking: string): AdPrivacyState {
  return { platform, optionsRequired: info.privacyOptionsRequirementStatus === "REQUIRED", optionsStatus: info.privacyOptionsRequirementStatus, consent: info.status, canRequestAds: info.canRequestAds, tracking, personalized: "unknown", choices: readAdConsentChoices(info.status, info.purposeConsents), checkedAt: Date.now() };
}
export async function getAdPrivacyState(refresh = false): Promise<AdPrivacyState | null> {
  const platform = adPlatform();
  if (!platform) return null;
  if (privacyRead) {
    if (!refresh) return privacyRead;
    try { await privacyRead; } catch { /* Explicit refresh can recover a failed read. */ }
    return getAdPrivacyState(true);
  }
  privacyRead = (async () => {
    const { consent, tracking } = await instance().readPrivacy(refresh);
    return privacyState(consent, platform, tracking);
  })().catch((error: unknown) => { log("privacy_error", "refresh_failed"); throw error; })
    .finally(() => { privacyRead = undefined; });
  return privacyRead;
}
export async function privacyOptionsRequired(): Promise<boolean> { return (await getAdPrivacyState())?.optionsRequired ?? false; }
export async function openPrivacyOptions(): Promise<void> {
  if (!adsSupported()) return;
  const state = await getAdPrivacyState();
  if (!canOpenPrivacyForm(state)) throw new Error("privacy_options_unavailable");
  await instance().changePrivacy();
}
