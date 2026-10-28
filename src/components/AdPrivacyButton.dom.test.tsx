// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdPrivacyButton } from "./AdPrivacyButton";
import { AdMobCoordinator, type AdAdapter } from "@/services/admob-coordinator";
import { readAdConsentChoices } from "@/lib/ad-consent-choices";
const api = vi.hoisted(() => ({ read: vi.fn(), open: vi.fn() }));
vi.mock("@/services/app-open-ad", async (original) => {
  const real = await original<typeof import("@/services/app-open-ad")>();
  return { ...real, adsSupported: () => true, getAdPrivacyState: api.read, openPrivacyOptions: api.open };
});
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const saved = { platform: "ios", consent: "OBTAINED", optionsStatus: "REQUIRED", isConsentFormAvailable: true, choices: { storage: "allowed", adProfile: "denied", useAdProfile: "allowed" } };
beforeEach(() => { vi.clearAllMocks(); api.read.mockResolvedValue(saved); api.open.mockResolvedValue(undefined); });
afterEach(cleanup);
async function panel() {
  const user = userEvent.setup(); render(<AdPrivacyButton />);
  await user.click(screen.getByRole("button", { name: "settings.adsPrivacyTitle" }));
  await waitFor(() => expect(screen.getAllByText("settings.adsChoiceAllowed")).toHaveLength(2));
  return user;
}
it("F4 form failure preserves native-read consent choices and is not a read failure", async () => {
  const user = await panel(); api.open.mockRejectedValue(new Error("presentation failed"));
  await user.click(screen.getByRole("button", { name: "settings.adsViewOrChange" }));
  await screen.findByText("settings.adsFormFailed");
  expect(screen.getAllByText("settings.adsChoiceAllowed")).toHaveLength(2);
  expect(screen.getAllByText("settings.adsChoiceDenied")).toHaveLength(1);
  expect(screen.queryByText("settings.adsReadFailed")).toBeNull();
});
it("F2 failed update with a readable snapshot shows a warning while keeping choices", async () => {
  const user = await panel();
  api.read.mockImplementation(async (refresh) => ({ ...saved, updateFailed: refresh === true }));
  await user.click(screen.getByRole("button", { name: "settings.adsRefreshStatus" }));
  await screen.findByText("settings.adsUpdateFailed");
  expect(api.read).toHaveBeenCalledWith(true);
  expect(screen.getAllByText("settings.adsChoiceAllowed")).toHaveLength(2);
  expect(screen.queryByText("settings.adsReadFailed")).toBeNull();
});
it("F1 successful refresh displays the newly read choices instead of the old snapshot", async () => {
  const user = await panel(); api.read.mockResolvedValue({ ...saved, updateFailed: false, choices: { storage: "denied", adProfile: "denied", useAdProfile: "denied" } });
  await user.click(screen.getByRole("button", { name: "settings.adsRefreshStatus" }));
  await waitFor(() => expect(screen.getAllByText("settings.adsChoiceDenied")).toHaveLength(3));
  expect(screen.queryByText("settings.adsUpdateFailed")).toBeNull();
});
it("native read failure never presents earlier choices as current", async () => {
  const user = await panel(); api.read.mockRejectedValue(new Error("reader unavailable"));
  await user.click(screen.getByRole("button", { name: "settings.adsRefreshStatus" }));
  await screen.findByText("settings.adsReadFailed");
  expect(screen.getAllByText("settings.adsChoiceUnknown")).toHaveLength(3);
});
it("TestFlight unknown Premium refresh reads through the coordinator and keeps choices visible without ads", async () => {
  const ad: AdAdapter = {
    premium: vi.fn(async () => null),
    consentSnapshot: vi.fn(async () => ({ status: "OBTAINED", privacyOptionsRequirementStatus: "REQUIRED", canRequestAds: true, purposeConsents: "1001" })),
    consentUpdate: vi.fn(), consentForm: vi.fn(), privacyForm: vi.fn(),
    tracking: vi.fn(async () => "denied"), requestTracking: vi.fn(),
    initialize: vi.fn(), load: vi.fn(), show: vi.fn(),
    invalidate: vi.fn(async () => undefined), setEligible: vi.fn(async () => undefined),
    state: vi.fn(async () => ({ loadedAt: null, foreground: true })),
    eligible: () => true, listen: vi.fn(async () => () => undefined),
  };
  const flow = new AdMobCoordinator(ad);
  api.read.mockImplementation(async (refresh = false) => {
    const result = await flow.readPrivacy(refresh);
    return { ...saved, ...result, choices: readAdConsentChoices(result.consent.status, result.consent.purposeConsents) };
  });
  const user = await panel();
  await user.click(screen.getByRole("button", { name: "settings.adsRefreshStatus" }));
  await screen.findByText("settings.adsUpdateFailed");
  expect(screen.queryByText("settings.adsReadFailed")).toBeNull();
  expect(screen.getAllByText("settings.adsChoiceAllowed")).toHaveLength(2);
  expect(screen.getAllByText("settings.adsChoiceDenied")).toHaveLength(1);
  expect(ad.premium).toHaveBeenCalledTimes(1);
  expect(ad.setEligible).toHaveBeenCalledWith(false);
  expect(ad.setEligible).not.toHaveBeenCalledWith(true);
  for (const fn of [ad.consentUpdate, ad.consentForm, ad.privacyForm, ad.requestTracking, ad.initialize, ad.load, ad.show]) expect(fn).not.toHaveBeenCalled();
});