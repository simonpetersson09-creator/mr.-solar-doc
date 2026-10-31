// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";

const markAdInteraction = vi.fn();
const startAppOpenAd = vi.fn();
const setAdLaunchPath = vi.fn();

vi.mock("@/services/app-open-ad", () => ({
  startAppOpenAd: (...args: unknown[]) => startAppOpenAd(...args),
  setAdLaunchPath: (...args: unknown[]) => setAdLaunchPath(...args),
  markAdInteraction: (...args: unknown[]) => markAdInteraction(...args),
}));
vi.mock("@/hooks/use-premium", () => ({
  premiumQueryOptions: () => ({}),
  PREMIUM_QUERY_KEY: ["premium"],
}));
vi.mock("@/services/iap-service", () => ({
  initializePurchases: async () => undefined,
  getPurchaseDiagnostics: () => ({ initialized: true }),
}));
vi.mock("@/services/purchase-recovery", () => ({
  drainPurchaseTransactions: async () => undefined,
}));
vi.mock("@/state/purchase-store", () => ({
  usePurchaseStore: { getState: () => ({ ensureDeviceId: () => "test-device" }) },
}));
vi.mock("@/services/ad-premium-resolver", () => ({
  createAdPremiumResolver: () => () => Promise.resolve(false),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    state: { location: { pathname: "/" } },
    subscribe: () => () => undefined,
  }),
}));

let useAppOpenAd: typeof import("@/hooks/use-app-open-ad").useAppOpenAd;
let useWizardStore: typeof import("@/state/wizard-store").useWizardStore;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  ({ useAppOpenAd } = await import("@/hooks/use-app-open-ad"));
  ({ useWizardStore } = await import("@/state/wizard-store"));
  useWizardStore.setState({ hasStarted: false, currentStep: 1 });
});

afterEach(() => cleanup());

function render() {
  const queryClient = new QueryClient();
  return renderHook(() => useAppOpenAd(queryClient));
}

describe("useAppOpenAd launch eligibility", () => {
  it("keeps the launch ad eligible when the app opens on step 1 with a saved guide", () => {
    useWizardStore.setState({ hasStarted: true });
    render();
    expect(startAppOpenAd).toHaveBeenCalledTimes(1);
    expect(markAdInteraction).not.toHaveBeenCalled();
  });

  it("cancels the launch ad when the welcome page starts the guide", () => {
    render();
    act(() => useWizardStore.getState().setStarted(true));
    expect(markAdInteraction).toHaveBeenCalledWith("wizard_started");
  });

  it("cancels the launch ad when a resumed guide changes", () => {
    useWizardStore.setState({ hasStarted: true });
    render();
    expect(markAdInteraction).not.toHaveBeenCalled();
    act(() => useWizardStore.getState().setCurrentStep(2));
    expect(markAdInteraction).toHaveBeenCalledWith("wizard_started");
  });
});
