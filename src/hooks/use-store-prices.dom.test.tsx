// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { PREMIUM_PRODUCT_ID, UNLOCK_PRODUCT_ID } from "@/config/purchase";

vi.mock("@/services/native-service", () => ({
  isNativePlatform: () => true,
  getPlatform: () => "ios",
}));

function makeStore() {
  const handlers: { productUpdated?: () => void; ready?: () => void } = {};
  const store = {
    products: [] as unknown[],
    register: () => undefined,
    initialize: async () => undefined,
    when: () => ({
      approved: () => undefined,
      cancelled: () => undefined,
      productUpdated: (cb: () => void) => (handlers.productUpdated = cb),
    }),
    ready: (cb: () => void) => (handlers.ready = cb),
    error: () => undefined,
    get: () => undefined,
    restorePurchases: async () => undefined,
  };
  return { store, handlers };
}

let useStorePrices: typeof import("@/hooks/use-store-prices").useStorePrices;

function Probe() {
  const state = useStorePrices();
  return (
    <div>
      <span data-testid="unlock">{state.unlock ?? "loading"}</span>
      <span data-testid="premium">{state.premium ?? "loading"}</span>
      <span data-testid="available">{String(state.available)}</span>
    </div>
  );
}

beforeEach(async () => {
  vi.resetModules();
  delete (window as unknown as { CdvPurchase?: unknown }).CdvPurchase;
  const iap = await import("@/services/iap-service");
  iap.__resetIapServiceForTests();
  ({ useStorePrices } = await import("@/hooks/use-store-prices"));
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { CdvPurchase?: unknown }).CdvPurchase;
});

describe("useStorePrices", () => {
  it("shows the price once StoreKit delivers products after the first render", async () => {
    const { store, handlers } = makeStore();
    render(<Probe />);
    expect(screen.getByTestId("unlock").textContent).toBe("loading");

    (window as unknown as { CdvPurchase?: unknown }).CdvPurchase = {
      store,
      ProductType: { CONSUMABLE: "consumable", PAID_SUBSCRIPTION: "paid subscription" },
      Platform: { APPLE_APPSTORE: "ios-appstore" },
    };
    store.products = [
      { id: UNLOCK_PRODUCT_ID, pricing: { price: "49,00 kr" } },
      { id: PREMIUM_PRODUCT_ID, offers: [{ pricingPhases: [{ price: "299,00 kr" }] }] },
    ];
    handlers.productUpdated?.();

    await waitFor(
      () => {
        expect(screen.getByTestId("unlock").textContent).toBe("49,00 kr");
        expect(screen.getByTestId("premium").textContent).toBe("299,00 kr");
        expect(screen.getByTestId("available").textContent).toBe("true");
      },
      { timeout: 4000 },
    );
  });
});

describe("useStorePrices stalled state", () => {
  it("stops loading forever and exposes a retry that re-asks StoreKit", async () => {
    vi.useFakeTimers();
    const { store } = makeStore();
    const update = vi.fn(async () => undefined);
    (store as unknown as { update: () => Promise<void> }).update = update;
    (window as unknown as { CdvPurchase?: unknown }).CdvPurchase = {
      store,
      ProductType: { CONSUMABLE: "consumable", PAID_SUBSCRIPTION: "paid subscription" },
      Platform: { APPLE_APPSTORE: "ios-appstore" },
    };

    let latest: import("@/hooks/use-store-prices").StorePricesState | null = null;
    function Capture() {
      latest = useStorePrices();
      return null;
    }
    render(<Capture />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });
    expect(latest!.status).toBe("unavailable");

    await act(async () => {
      latest!.retry();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(update).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
