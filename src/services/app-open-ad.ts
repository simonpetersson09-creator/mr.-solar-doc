/**
 * AdMob App Open ad — iOS and Android, one attempt per cold start.
 *
 * Flow: UMP consent → (ATT, only if consent allows and status undetermined)
 * → initialize → load → show, but only while the user is still on the launch
 * view. Every failure path just ends silently; the app never waits for an ad.
 * The web never loads the SDK (dynamic import behind the native guard).
 */
import { getPlatform, isNativePlatform } from "@/services/native-service";

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

/** Ads older than this are discarded (Google: app open ads expire after 4 h). */
const AD_MAX_AGE_MS = 4 * 60 * 60 * 1000;
/** After this the launch view is considered left even without interaction. */
const LAUNCH_WINDOW_MS = 5000;

export function appOpenAdUnitId(isProduction: boolean, platform: AdPlatform = "ios"): string {
  if (platform === "android") return isProduction ? ADMOB_ANDROID_APP_OPEN_PROD : ADMOB_ANDROID_APP_OPEN_TEST;
  return isProduction ? ADMOB_IOS_APP_OPEN_PROD : ADMOB_IOS_APP_OPEN_TEST;
}

/** The native platform that shows ads, or null (web). */
export function adPlatform(): AdPlatform | null {
  if (!isNativePlatform()) return null;
  const p = getPlatform();
  return p === "ios" || p === "android" ? p : null;
}

export function adsSupported(): boolean {
  return adPlatform() !== null;
}

/** Pure decision used by the flow and the tests. */
export function shouldShowAppOpen(s: {
  alreadyShown: boolean;
  userEnteredApp: boolean;
  premium: boolean;
  canRequestAds: boolean;
  loadedAt: number | null;
  now: number;
}): boolean {
  if (s.alreadyShown || s.userEnteredApp || s.premium || !s.canRequestAds) return false;
  if (s.loadedAt == null) return false;
  return s.now - s.loadedAt < AD_MAX_AGE_MS;
}

let started = false;
let shown = false;
let userEnteredApp = false;

function markEntered() {
  userEnteredApp = true;
}

/**
 * Starts the cold-start ad attempt. Safe to call repeatedly — runs once per
 * JS process (= per cold start). `isPremium` resolves the entitlement; a
 * Premium user never sees the ad.
 */
export function startAppOpenAd(isPremium: () => Promise<boolean>): void {
  if (started || !adsSupported()) return;
  started = true;

  // Any touch or the launch window running out means the user is "in" the app.
  window.addEventListener("pointerdown", markEntered, { once: true, capture: true });
  window.setTimeout(markEntered, LAUNCH_WINDOW_MS);

  void run(isPremium).catch(() => undefined);
}

async function run(isPremium: () => Promise<boolean>): Promise<void> {
  const premiumPromise = isPremium().catch(() => false);
  const { AdMob, AdmobConsentStatus } = await import("@capacitor-community/admob");

  // 1. UMP: refresh consent every start; show the form only when required.
  let consent = await AdMob.requestConsentInfo();
  if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
    consent = await AdMob.showConsentForm();
  }
  if (!consent.canRequestAds) return;

  const platform = adPlatform() ?? "ios";

  // 2. ATT (iOS only, separate from UMP). A "no" only means non-personalised ads.
  if (platform === "ios") try {
    const att = await AdMob.trackingAuthorizationStatus();
    if (att.status === "notDetermined") await AdMob.requestTrackingAuthorization();
  } catch {
    /* ATT unavailable — continue */
  }

  // 3. Init + load. Test ads unless this is a production build.
  const isProduction = import.meta.env.PROD;
  await AdMob.initialize({ initializeForTesting: !isProduction });
  if (await premiumPromise) return;
  if (userEnteredApp) return; // no point loading an ad that can no longer show

  const adId = appOpenAdUnitId(isProduction, platform);
  await AdMob.loadAppOpen({ adId });
  const loadedAt = Date.now();

  const ok = shouldShowAppOpen({
    alreadyShown: shown,
    userEnteredApp,
    premium: await premiumPromise,
    canRequestAds: consent.canRequestAds,
    loadedAt,
    now: Date.now(),
  });
  if (!ok) return;
  shown = true; // set before await: blocks double presentation
  await AdMob.showAppOpen({ adId });
}

export type AdPrivacyState = {
  platform: AdPlatform;
  optionsRequired: boolean;
  /** UMP consent status: OBTAINED / NOT_REQUIRED / REQUIRED / UNKNOWN. */
  consent: string;
  canRequestAds: boolean;
  /** ATT: authorized / denied / restricted / notDetermined / unknown. */
  tracking: string;
};

/** Current UMP + ATT choices, read live from the SDK (never cached). */
export async function getAdPrivacyState(): Promise<AdPrivacyState | null> {
  const platform = adPlatform();
  if (!platform) return null;
  try {
    const { AdMob } = await import("@capacitor-community/admob");
    const info = await AdMob.requestConsentInfo();
    let tracking = "unknown";
    if (platform === "ios") try {
      tracking = String((await AdMob.trackingAuthorizationStatus()).status);
    } catch {
      /* ATT unavailable */
    }
    return {
      platform,
      optionsRequired: String(info.privacyOptionsRequirementStatus) === "REQUIRED",
      consent: String(info.status),
      canRequestAds: !!info.canRequestAds,
      tracking,
    };
  } catch {
    return null;
  }
}

/** True when UMP says the user must be able to reopen privacy choices. */
export async function privacyOptionsRequired(): Promise<boolean> {
  return (await getAdPrivacyState())?.optionsRequired ?? false;
}

export async function openPrivacyOptions(): Promise<void> {
  if (!adsSupported()) return;
  try {
    const { AdMob } = await import("@capacitor-community/admob");
    await AdMob.showPrivacyOptionsForm();
  } catch {
    /* form unavailable */
  }
}
