// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({ default: { language: "sv" } }));
vi.mock("@/services/native-service", () => ({ getPlatform: vi.fn(() => "ios") }));
vi.mock("@/state/purchase-store", () => ({ usePurchaseStore: { getState: () => ({ ensureDeviceId: () => "test-device" }) } }));
vi.mock("@/state/wizard-store", () => ({ useWizardStore: { getState: () => ({ location: { countryCode: "it" } }) } }));
import { getPlatform } from "./native-service";
import { trackAdLaunchEvent } from "./stats";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.mocked(getPlatform).mockReturnValue("ios"); });
it.each(["ios", "android"] as const)("sends only fixed app outcome fields on %s", (platform) => {
  vi.mocked(getPlatform).mockReturnValue(platform);
  const fetcher = vi.fn<(url: string, options: RequestInit) => Promise<Response>>().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetcher);
  trackAdLaunchEvent("ad_open_shown");
  expect(fetcher).toHaveBeenCalledTimes(1);
  const call = fetcher.mock.calls[0];
  if (!call) throw new Error("No stats request sent");
  expect(JSON.parse(String(call[1].body))).toEqual({ deviceId: "test-device", event: "ad_open_shown", country: "IT", platform, language: "sv" });
  expect(call[0]).toMatch(/\/api\/public\/events$/);
});
it("never sends web ad statistics", () => {
  vi.mocked(getPlatform).mockReturnValue("web"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  trackAdLaunchEvent("ad_open_started"); expect(fetcher).not.toHaveBeenCalled();
});
it("network failure never rejects into the ad flow", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect(() => trackAdLaunchEvent("ad_open_started")).not.toThrow(); await Promise.resolve();
});