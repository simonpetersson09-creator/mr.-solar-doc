// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREMIUM_PRODUCT_ID, UNLOCK_PRODUCT_ID } from "@/config/purchase";

vi.mock("@/services/native-service", () => ({
  isNativePlatform: () => true,
  getPlatform: () => "ios",
}));

type Handlers = {
  approved?: (t: unknown) => void;
  cancelled?: () => void;
  productUpdated?: () => void;
  ready?: () => void;
  error?: (e: { code?: number; message?: string }) => void;
};

function makeStore(options: {
  products?: unknown[];
  offer?: { order: () => Promise<unknown> } | null;
  initializeRejects?: string;
} = {}) {
  const handlers: Handlers = {};
  const registerCalls: unknown[][] = [];
  const store = {
    products: options.products ?? [],
    register: (list: unknown[]) => registerCalls.push(list),
    initialize: vi.fn(async () => {
      if (options.initializeRejects) throw new Error(options.initializeRejects);
      return undefined;
    }),
    when: () => ({
      approved: (cb: (t: unknown) => void) => (handlers.approved = cb),
      cancelled: (cb: () => void) => (handlers.cancelled = cb),
      productUpdated: (cb: () => void) => (handlers.productUpdated = cb),
    }),
    ready: (cb: () => void) => (handlers.ready = cb),
    error: (cb: (e: { code?: number; message?: string }) => void) => (handlers.error = cb),
    get: () => ({ getOffer: () => options.offer ?? undefined }),
    restorePurchases: vi.fn(async () => undefined),
  };
  return { store, handlers, registerCalls };
}

function install(store: unknown) {
  (window as unknown as { CdvPurchase?: unknown }).CdvPurchase = {
    store,
    ProductType: { CONSUMABLE: "consumable", PAID_SUBSCRIPTION: "paid subscription" },
    Platform: { APPLE_APPSTORE: "ios-appstore" },
  };
}

let iap: typeof import("@/services/iap-service");

beforeEach(async () => {
  vi.resetModules();
  delete (window as unknown as { CdvPurchase?: unknown }).CdvPurchase;
  iap = await import("@/services/iap-service");
  iap.__resetIapServiceForTests();
});

afterEach(() => {
  delete (window as unknown as { CdvPurchase?: unknown }).CdvPurchase;
});

describe("plugin availability", () => {
  it("is not locked to false when the plugin arrives after mount", async () => {
    expect(iap.isPurchaseAvailable()).toBe(false);
    expect(iap.isPurchaseSupported()).toBe(true);

    const { store } = makeStore();
    setTimeout(() => install(store), 50);
    const cdv = await iap.waitForPurchasePlugin(2000);

    expect(cdv).not.toBeNull();
    expect(iap.isPurchaseAvailable()).toBe(true);
  });

  it("returns null when the plugin never appears", async () => {
    const cdv = await iap.waitForPurchasePlugin(300);
    expect(cdv).toBeNull();
  });
});

describe("initialisation", () => {
  it("registers products exactly once even with concurrent and repeated calls", async () => {
    const { store, registerCalls } = makeStore();
    install(store);

    await Promise.all([iap.initializePurchases(), iap.initializePurchases()]);
    await iap.initializePurchases();

    expect(registerCalls).toHaveLength(1);
    expect(store.initialize).toHaveBeenCalledTimes(1);
    expect(iap.getPurchaseDiagnostics().initialized).toBe(true);
  });

  it("records a StoreKit init failure without throwing", async () => {
    const { store } = makeStore({ initializeRejects: "init boom" });
    install(store);

    await expect(iap.initializePurchases()).resolves.toBeUndefined();
    expect(iap.getPurchaseDiagnostics().lastErrorMessage).toContain("init boom");
  });

  it("keeps working when the paywall opens before the plugin is ready", async () => {
    const { store } = makeStore();
    const initPromise = iap.initializePurchases();
    setTimeout(() => install(store), 40);
    await initPromise;
    expect(iap.getPurchaseDiagnostics().pluginPresent).toBe(true);
  });
});

describe("prices", () => {
  it("reads the localized consumable price", () => {
    const { store } = makeStore({
      products: [{ id: UNLOCK_PRODUCT_ID, pricing: { price: "49,00 kr" } }],
    });
    install(store);
    expect(iap.getStorePrice(UNLOCK_PRODUCT_ID)).toBe("49,00 kr");
  });

  it("reads the subscription price from the offer pricing phases", () => {
    const { store } = makeStore({
      products: [
        {
          id: PREMIUM_PRODUCT_ID,
          offers: [{ pricingPhases: [{ price: "0,00 kr" }, { price: "299,00 kr" }] }],
        },
      ],
    });
    install(store);
    expect(iap.getStorePrice(PREMIUM_PRODUCT_ID)).toBe("299,00 kr");
  });

  it("returns null for a missing product", () => {
    const { store } = makeStore({ products: [] });
    install(store);
    expect(iap.getStorePrices()).toEqual({ unlock: null, premium: null });
  });

  it("notifies subscribers when products are updated", async () => {
    const { store, handlers } = makeStore();
    install(store);
    await iap.initializePurchases();

    const listener = vi.fn();
    iap.subscribeToStore(listener);
    store.products = [{ id: UNLOCK_PRODUCT_ID, pricing: { price: "49,00 kr" } }];
    handlers.productUpdated?.();

    expect(listener).toHaveBeenCalled();
    expect(iap.getStorePrice(UNLOCK_PRODUCT_ID)).toBe("49,00 kr");
  });
});

describe("purchase errors", () => {
  it("fails as unavailable with a diagnostic detail when no offer exists", async () => {
    const { store } = makeStore({ offer: null });
    install(store);
    await expect(iap.purchaseUnlock()).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("keeps the StoreKit code and message on a purchase error", async () => {
    const { store, handlers } = makeStore({
      offer: { order: async () => undefined },
    });
    install(store);
    await iap.initializePurchases();

    const promise = iap.purchasePremium();
    await Promise.resolve();
    handlers.error?.({ code: 6777010, message: "Unable to process purchase" });

    await expect(promise).rejects.toMatchObject({
      reason: "failed",
      code: 6777010,
    });
    const diagnostics = iap.getPurchaseDiagnostics();
    expect(diagnostics.lastErrorCode).toBe(6777010);
    expect(diagnostics.lastErrorMessage).toBe("Unable to process purchase");
  });

  it("maps a cancelled order to the cancelled reason", async () => {
    const { store, handlers } = makeStore({ offer: { order: async () => undefined } });
    install(store);
    await iap.initializePurchases();
    const promise = iap.purchasePremium();
    await Promise.resolve();
    handlers.cancelled?.();
    await expect(promise).rejects.toMatchObject({ reason: "cancelled" });
  });

  it("describes errors for logging and outcome reporting", () => {
    const error = new iap.PurchaseError("failed", "Unable to process", { code: 42 });
    expect(iap.describePurchaseError(error)).toContain("code=42");
    expect(iap.describePurchaseError(error)).toContain("Unable to process");
  });
});
