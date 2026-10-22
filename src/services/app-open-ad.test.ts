import { describe, expect, it } from "vitest";
import { appOpenAdUnitId, shouldShowAppOpen, ADMOB_IOS_APP_OPEN_PROD, ADMOB_IOS_APP_OPEN_TEST } from "./app-open-ad";

const base = { alreadyShown: false, userEnteredApp: false, premium: false, canRequestAds: true, loadedAt: 1000, now: 2000 };

describe("app open ad", () => {
  it("uses production id only in production builds", () => {
    expect(appOpenAdUnitId(true)).toBe(ADMOB_IOS_APP_OPEN_PROD);
    expect(appOpenAdUnitId(false)).toBe(ADMOB_IOS_APP_OPEN_TEST);
  });
  it("shows a fresh ad on the launch view", () => expect(shouldShowAppOpen(base)).toBe(true));
  it("never shows a second ad per cold start", () => expect(shouldShowAppOpen({ ...base, alreadyShown: true })).toBe(false));
  it("does not show a late ad after the user entered the app", () => expect(shouldShowAppOpen({ ...base, userEnteredApp: true })).toBe(false));
  it("never shows to Premium users", () => expect(shouldShowAppOpen({ ...base, premium: true })).toBe(false));
  it("respects UMP", () => expect(shouldShowAppOpen({ ...base, canRequestAds: false })).toBe(false));
  it("discards ads older than 4 hours", () => expect(shouldShowAppOpen({ ...base, now: 1000 + 4 * 3600_000 })).toBe(false));
});
