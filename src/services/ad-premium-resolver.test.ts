import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAdPremiumResolver, type AdPremiumDependencies } from "./ad-premium-resolver";
import { AdMobCoordinator, type AdAdapter } from "./admob-coordinator";

function fixture() {
  const deps: AdPremiumDependencies = {
    initialize: vi.fn(async () => undefined), initialized: vi.fn(() => true),
    drain: vi.fn(async () => undefined), cachedActive: vi.fn(() => false),
    fetchStatus: vi.fn(async () => ({ active: false, stale: false })),
  };
  return { deps, resolve: createAdPremiumResolver(deps) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100000); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("retries a failed first initialization once after a delay and retains only successful readiness", async () => {
  const { deps, resolve } = fixture(); vi.mocked(deps.initialize).mockRejectedValueOnce(new Error("late plugin"));
  const result = resolve(); await vi.advanceTimersByTimeAsync(999);
  expect(deps.initialize).toHaveBeenCalledTimes(1); expect(deps.fetchStatus).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(await result).toBe(false);
  expect(deps.initialize).toHaveBeenCalledTimes(2); expect(deps.drain).toHaveBeenCalledTimes(1);
  await resolve(); expect(deps.initialize).toHaveBeenCalledTimes(2); expect(deps.fetchStatus).toHaveBeenCalledTimes(2);
});
it("a resolved but uninitialized first attempt is not permanently cached", async () => {
  const { deps, resolve } = fixture(); vi.mocked(deps.initialized).mockReturnValueOnce(false).mockReturnValue(true);
  const result = resolve(); await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toBe(false); expect(deps.initialize).toHaveBeenCalledTimes(2);
  expect(deps.drain).toHaveBeenCalledTimes(1);
});
it("unexpected recovery rejection can recover without retaining its rejected promise", async () => {
  const { deps, resolve } = fixture(); vi.mocked(deps.drain).mockRejectedValueOnce(new Error("recovery failed"));
  const result = resolve(); await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toBe(false); expect(deps.drain).toHaveBeenCalledTimes(2);
});
it("coalesces concurrent callers across initialization, drain, status requests and delayed retry", async () => {
  const { deps, resolve } = fixture(); let release: (value: { active: boolean }) => void = () => undefined;
  const pending = new Promise<{ active: boolean }>((done) => { release = done; });
  vi.mocked(deps.fetchStatus).mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(pending);
  const first = resolve(); expect(resolve()).toBe(first);
  await vi.advanceTimersByTimeAsync(1000); expect(resolve()).toBe(first);
  await vi.advanceTimersByTimeAsync(1000); expect(resolve()).toBe(first);
  expect(deps.initialize).toHaveBeenCalledTimes(1); expect(deps.drain).toHaveBeenCalledTimes(1);
  expect(deps.fetchStatus).toHaveBeenCalledTimes(2);
  release({ active: false }); expect(await first).toBe(false);
});
it("stops after two failures, enforces cooldown and retries only on a later caller", async () => {
  const { deps, resolve } = fixture(); vi.mocked(deps.fetchStatus).mockRejectedValue(new Error("offline"));
  const result = resolve(); await vi.advanceTimersByTimeAsync(1000); expect(await result).toBeNull();
  for (let index = 0; index < 20; index++) expect(await resolve()).toBeNull();
  expect(deps.fetchStatus).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4999); expect(await resolve()).toBeNull();
  await vi.advanceTimersByTimeAsync(1); expect(deps.fetchStatus).toHaveBeenCalledTimes(2);
  vi.mocked(deps.fetchStatus).mockResolvedValue({ active: false });
  expect(await resolve()).toBe(false); expect(deps.fetchStatus).toHaveBeenCalledTimes(3);
});
it("persistent missing initialization has a bounded budget and never queries entitlement", async () => {
  const { deps, resolve } = fixture(); vi.mocked(deps.initialized).mockReturnValue(false);
  const result = resolve(); await vi.advanceTimersByTimeAsync(1000); expect(await result).toBeNull();
  await vi.advanceTimersByTimeAsync(60000);
  expect(deps.initialize).toHaveBeenCalledTimes(2); expect(deps.drain).not.toHaveBeenCalled(); expect(deps.fetchStatus).not.toHaveBeenCalled();
});
it("stale inactive remains unknown while stale active continues to protect Premium", async () => {
  const { deps, resolve } = fixture(); vi.mocked(deps.fetchStatus).mockResolvedValue({ active: false, stale: true });
  const result = resolve(); await vi.advanceTimersByTimeAsync(1000); expect(await result).toBeNull();
  await vi.advanceTimersByTimeAsync(5000); vi.mocked(deps.fetchStatus).mockResolvedValue({ active: true, stale: true });
  expect(await resolve()).toBe(true);
});
it("cached active Premium suppresses server queries but never bypasses readiness", async () => {
  const { deps, resolve } = fixture(); vi.mocked(deps.cachedActive).mockReturnValue(true);
  expect(await resolve()).toBe(true); expect(deps.initialize).toHaveBeenCalledTimes(1); expect(deps.drain).toHaveBeenCalledTimes(1);
  expect(deps.fetchStatus).not.toHaveBeenCalled();
});
it("late entitlement recovery after launch timeout never restarts or permits ads", async () => {
  const { deps, resolve } = fixture(); let finish: (value: { active: boolean }) => void = () => undefined;
  vi.mocked(deps.fetchStatus).mockReturnValueOnce(new Promise((done) => { finish = done; }));
  const consent = { status: "OBTAINED", privacyOptionsRequirementStatus: "REQUIRED", canRequestAds: true };
  const ad: AdAdapter = {
    premium: resolve, consentUpdate: vi.fn(async () => consent), consentSnapshot: vi.fn(async () => consent),
    consentForm: vi.fn(async () => consent), privacyForm: vi.fn(), tracking: vi.fn(async () => "denied"),
    initialize: vi.fn(), load: vi.fn(), show: vi.fn(), invalidate: vi.fn(async () => undefined),
    setEligible: vi.fn(async () => undefined), state: vi.fn(async () => ({ loadedAt: null, foreground: true })),
    eligible: () => true, listen: vi.fn(async () => () => undefined),
  };
  const flow = new AdMobCoordinator(ad); const start = flow.start();
  await vi.advanceTimersByTimeAsync(15000); await start;
  expect(await resolve()).toBeNull(); expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
  finish({ active: false }); await vi.advanceTimersByTimeAsync(0);
  vi.mocked(deps.fetchStatus).mockResolvedValue({ active: false });
  expect(await resolve()).toBe(false);
  await flow.start();
  for (const fn of [ad.consentUpdate, ad.consentForm, ad.initialize, ad.load, ad.show]) expect(fn).not.toHaveBeenCalled();
  expect(ad.setEligible).not.toHaveBeenCalledWith(true);
});
it("a hung request times out without releasing the underlying single-flight lock or retrying", async () => {
  const { deps, resolve } = fixture(); vi.mocked(deps.fetchStatus).mockReturnValue(new Promise(() => undefined));
  const result = resolve(); await vi.advanceTimersByTimeAsync(15000); expect(await result).toBeNull();
  await vi.advanceTimersByTimeAsync(60000);
  for (let index = 0; index < 10; index++) expect(await resolve()).toBeNull();
  expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
});