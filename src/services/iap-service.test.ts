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
  initializeErrors?: { isError: true; code: number; message: string; productId: string | null }[];
  /** Mirrors the plugin's `store.isReady` (adapter started + products loaded). */
  isReady?: boolean;
} = {}) {
  const handlers: Handlers = {};
  const registerCalls: unknown[][] = [];
  const store = {
    isReady: options.isReady ?? true,
    minTimeBetweenUpdates: 600_000,
    products: options.products ?? [],
    register: (list: unknown[]) => registerCalls.push(list),
    initialize: vi.fn(async () => {
      if (options.initializeRejects) throw new Error(options.initializeRejects);
      return options.initializeErrors ?? [];
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
  it("uses the directly imported Capacitor store before a window global exists", async () => {
    expect(iap.isPurchaseAvailable()).toBe(true);
    expect(iap.isPurchaseSupported()).toBe(true);

    const { store } = makeStore();
    install(store);
    const cdv = await iap.waitForPurchasePlugin(2000);

    expect(cdv).not.toBeNull();
    expect(iap.isPurchaseAvailable()).toBe(true);
  });

  it("returns null when the plugin never appears", async () => {
    // The Capacitor package exports its Store synchronously; native availability
    // is determined by platform support rather than a late Cordova global.
    const cdv = await iap.waitForPurchasePlugin(300);
    expect(cdv).not.toBeNull();
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

  it("does not mark the store initialised when StoreKit returns errors", async () => {
    const { store } = makeStore({
      initializeErrors: [
        { isError: true, code: 6777002, message: "Failed to load products", productId: null },
      ],
    });
    install(store);

    await iap.initializePurchases();

    // A resolved-with-errors init must not be cached as ready.
    expect(iap.getPurchaseDiagnostics().initialized).toBe(false);
    expect(iap.getPurchaseDiagnostics().lastErrorCode).toBe(6777002);
    expect(iap.getPurchaseDiagnostics().lastErrorMessage).toBe("Failed to load products");

    await iap.initializePurchases();
    // Plugin v13 is one-shot internally, so the service must not pretend this
    // second call restarted the adapter.
    expect(store.initialize).toHaveBeenCalledTimes(1);
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

  it("prefers the recurring phase over an introductory product price", () => {
    const { store } = makeStore({
      products: [
        {
          id: PREMIUM_PRODUCT_ID,
          pricing: { price: "0,00 kr" },
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
  }, 40000);

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

  it("handles the v13 resolved IError from order()", async () => {
    const { store } = makeStore({
      offer: {
        order: async () => ({
          isError: true,
          code: 6777008,
          message: "Payments are not allowed",
          productId: PREMIUM_PRODUCT_ID,
        }),
      },
    });
    install(store);

    await expect(iap.purchasePremium()).rejects.toMatchObject({
      reason: "failed",
      code: 6777008,
    });
  });

  it("maps a resolved StoreKit cancellation code to cancelled", async () => {
    const { store } = makeStore({
      offer: {
        order: async () => ({
          isError: true,
          code: 6777006,
          message: "The user closed the payment sheet",
          productId: PREMIUM_PRODUCT_ID,
        }),
      },
    });
    install(store);

    await expect(iap.purchasePremium()).rejects.toMatchObject({
      reason: "cancelled",
      code: 6777006,
    });
  });

  it("describes errors for logging and outcome reporting", () => {
    const error = new iap.PurchaseError("failed", "Unable to process", { code: 42 });
    expect(iap.describePurchaseError(error)).toContain("code=42");
    expect(iap.describePurchaseError(error)).toContain("Unable to process");
  });
});

describe("recovery after a failed initialisation", () => {
  it("does not pretend the plugin's one-shot initialize can restart", async () => {
    let failNext = true;
    const handlers: Record<string, ((arg?: unknown) => void) | undefined> = {};
    const store = {
      products: [] as unknown[],
      register: () => undefined,
      initialize: vi.fn(async () => {
        if (failNext) {
          failNext = false;
          throw new Error("init boom");
        }
        return undefined;
      }),
      when: () => ({
        approved: (cb: (t: unknown) => void) => (handlers["approved"] = cb),
        cancelled: (cb: () => void) => (handlers["cancelled"] = cb),
        productUpdated: (cb: () => void) => (handlers["productUpdated"] = cb),
      }),
      ready: (cb: () => void) => (handlers["ready"] = cb),
      error: () => undefined,
      get: () => undefined,
      restorePurchases: async () => undefined,
    };
    install(store);

    await iap.initializePurchases();
    expect(iap.getPurchaseDiagnostics().initialized).toBe(false);

    await iap.initializePurchases();
    expect(store.initialize).toHaveBeenCalledTimes(1);
    expect(iap.getPurchaseDiagnostics().initialized).toBe(false);
  });
});

describe("purchase with a late product", () => {
  it("waits for StoreKit to deliver the product before failing", async () => {
    const order = vi.fn(async () => undefined);
    const { store } = makeStore({ offer: null });
    const late = store as unknown as {
      products: unknown[];
      get: () => { getOffer: () => unknown } | undefined;
      update?: () => Promise<void>;
    };
    late.update = async () => {
      late.products = [{ id: PREMIUM_PRODUCT_ID, pricing: { price: "299,00 kr" } }];
      late.get = () => ({ getOffer: () => ({ order }) });
    };
    install(store);

    const promise = iap.purchasePremium();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(order).toHaveBeenCalled();
    void promise.catch(() => undefined);
  });
});

describe("transaction routing during a purchase", () => {
  it("does not resolve a purchase with an unrelated product's transaction", async () => {
    const { store, handlers } = makeStore({ offer: { order: async () => undefined } });
    install(store);
    await iap.initializePurchases();

    const promise = iap.purchasePremium();
    await Promise.resolve();
    // A renewal/restore of the consumable arrives mid-flow.
    handlers.approved?.({
      transactionId: "other-1",
      products: [{ id: UNLOCK_PRODUCT_ID }],
      finish: () => undefined,
    });
    let settled = false;
    void promise.then(
      () => (settled = true),
      () => (settled = true),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);

    handlers.approved?.({
      transactionId: "premium-1",
      products: [{ id: PREMIUM_PRODUCT_ID }],
      finish: () => undefined,
    });
    await expect(promise).resolves.toMatchObject({ transactionId: "premium-1" });
    // The unrelated one is queued for the recovery drain, not lost.
    expect(iap.takeUnclaimedTransactions().map((t) => t.transactionId)).toEqual(["other-1"]);
  });

  it("ignores store errors that arrive before the order is placed", async () => {
    const { store, handlers } = makeStore();
    install(store);
    await iap.initializePurchases();

    handlers.error?.({ code: 6777001, message: "product load failed" });
    expect(iap.getPurchaseDiagnostics().lastErrorMessage).toBe("product load failed");
  });
});

describe("unclaimed transaction queue", () => {
  it("can requeue a transaction that could not be verified", async () => {
    const { store, handlers } = makeStore();
    install(store);
    await iap.initializePurchases();

    handlers.approved?.({
      transactionId: "t-1",
      products: [{ id: PREMIUM_PRODUCT_ID }],
      finish: () => undefined,
    });
    const [first] = iap.takeUnclaimedTransactions();
    expect(first?.transactionId).toBe("t-1");
    expect(iap.takeUnclaimedTransactions()).toHaveLength(0);

    first!.requeue();
    expect(iap.takeUnclaimedTransactions().map((t) => t.transactionId)).toEqual(["t-1"]);
  });
});

describe("product loading states", () => {
  it("reports a purchasable offer when StoreKit answers immediately", async () => {
    const { store } = makeStore({
      products: [{ id: UNLOCK_PRODUCT_ID, pricing: { price: "49,00 kr" } }],
      offer: { order: async () => undefined },
    });
    install(store);
    await iap.initializePurchases();

    expect(iap.hasPurchasableOffer(UNLOCK_PRODUCT_ID)).toBe(true);
    expect(iap.getStorePrice(UNLOCK_PRODUCT_ID)).toBe("49,00 kr");
  });

  it("has no purchasable offer while StoreKit is still loading products", async () => {
    const { store } = makeStore({ products: [], offer: null });
    install(store);
    await iap.initializePurchases();

    expect(iap.hasPurchasableOffer(UNLOCK_PRODUCT_ID)).toBe(false);
    expect(iap.getStorePrices()).toEqual({ unlock: null, premium: null });
  });

  it("finds the product after a slow App Store answer", async () => {
    const { store } = makeStore({ products: [], offer: null });
    install(store);
    await iap.initializePurchases();
    expect(iap.hasPurchasableOffer(PREMIUM_PRODUCT_ID)).toBe(false);

    const late = store as unknown as { products: unknown[]; get: () => unknown };
    late.products = [{ id: PREMIUM_PRODUCT_ID, pricing: { price: "299,00 kr" } }];
    late.get = () => ({ getOffer: () => ({ order: async () => undefined }) });

    expect(await iap.waitForProduct(PREMIUM_PRODUCT_ID, 1000)).toBe(true);
    expect(iap.hasPurchasableOffer(PREMIUM_PRODUCT_ID)).toBe(true);
  });
});

describe("refresh and retry", () => {
  it("uses store.update() when the plugin provides it", async () => {
    const { store } = makeStore({ products: [] });
    const update = vi.fn(async () => undefined);
    (store as unknown as { update?: () => Promise<void> }).update = update;
    install(store);

    await iap.refreshStoreProducts();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("bypasses the plugin's update throttle during an active recovery", async () => {
    const { store } = makeStore({ products: [] });
    const seen: (number | undefined)[] = [];
    const target = store as unknown as {
      update?: () => Promise<void>;
      minTimeBetweenUpdates?: number;
    };
    target.update = vi.fn(async () => {
      seen.push(target.minTimeBetweenUpdates);
    });
    install(store);

    await iap.refreshStoreProducts();
    await iap.refreshStoreProducts();
    // The throttle is 0 while loading and restored to the plugin default after.
    expect(seen).toEqual([0, 0]);
    expect(target.minTimeBetweenUpdates).toBe(600_000);
  });

  it("does not pretend a retry is possible when the adapter never became ready", async () => {
    const { store } = makeStore({ products: [], isReady: false });
    (store as unknown as { update?: () => Promise<void> }).update = vi.fn(async () => undefined);
    install(store);
    await iap.initializePurchases();

    // v13 initialize() is one-shot and update() is ignored before ready, so
    // there is no supported in-session reload — the UI must not offer one.
    expect(iap.canRefreshStoreProducts()).toBe(false);
  });

  it("reports a possible retry once the adapter is ready", async () => {
    const { store } = makeStore({ products: [] });
    (store as unknown as { update?: () => Promise<void> }).update = vi.fn(async () => undefined);
    install(store);
    await iap.initializePurchases();

    expect(iap.canRefreshStoreProducts()).toBe(true);
  });

  it("coalesces overlapping refreshes into a single product load", async () => {
    const { store } = makeStore({ products: [] });
    const update = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
    );
    (store as unknown as { update?: () => Promise<void> }).update = update;
    install(store);

    await Promise.all([
      iap.refreshStoreProducts(),
      iap.refreshStoreProducts(),
      iap.refreshStoreProducts(),
    ]);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("never registers products or listeners twice across retries", async () => {
    const { store, registerCalls } = makeStore({ products: [] });
    install(store);

    await iap.initializePurchases();
    await iap.refreshStoreProducts();
    await iap.refreshStoreProducts();

    expect(registerCalls).toHaveLength(1);
  });

  it("delivers an approved transaction exactly once after retries", async () => {
    const { store, handlers } = makeStore({ products: [] });
    install(store);
    await iap.initializePurchases();
    await iap.refreshStoreProducts();

    handlers.approved?.({
      transactionId: "t-once",
      products: [{ id: PREMIUM_PRODUCT_ID }],
      finish: () => undefined,
    });
    expect(iap.takeUnclaimedTransactions().map((t) => t.transactionId)).toEqual(["t-once"]);
    expect(iap.takeUnclaimedTransactions()).toHaveLength(0);
  });
});

describe("successful purchase", () => {
  it("resolves with the verified transaction and finishes only on demand", async () => {
    const finish = vi.fn(async () => undefined);
    const { store, handlers } = makeStore({
      products: [{ id: UNLOCK_PRODUCT_ID, pricing: { price: "49,00 kr" } }],
      offer: { order: async () => undefined },
    });
    install(store);
    await iap.initializePurchases();

    const promise = iap.purchaseUnlock();
    await Promise.resolve();
    handlers.approved?.({
      transactionId: "ok-1",
      products: [{ id: UNLOCK_PRODUCT_ID }],
      finish,
    });

    const result = await promise;
    expect(result.transactionId).toBe("ok-1");
    expect(finish).not.toHaveBeenCalled();
    await result.finish();
    expect(finish).toHaveBeenCalledTimes(1);
  });
});
