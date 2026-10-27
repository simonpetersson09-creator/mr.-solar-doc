import { registerPlugin } from "@capacitor/core";

export interface NativeConsent {
  status: string;
  canRequestAds: boolean;
  isConsentFormAvailable?: boolean;
  privacyOptionsRequirementStatus: string;
}

/** Methods supplied by the version-checked, reproducible native patch. */
interface AdMobSafety {
  getConsentSnapshot(): Promise<NativeConsent>;
  invalidateAppOpen(): Promise<void>;
  getAppOpenState(options: { adId: string }): Promise<{ loadedAt: number | null; foreground: boolean; testBuild: boolean }>;
  setAppOpenEligible(options: { eligible: boolean }): Promise<void>;
}

export const adMobSafety = registerPlugin<AdMobSafety>("AdMob");