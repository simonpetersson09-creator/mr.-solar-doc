/**
 * Android-specific behaviour of the IAP service: Google Play is a supported
 * purchase platform, and the purchase token (not the transaction id, which can
 * be the GPA.... order id) is what the server verifies against Google.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetIapServiceForTests, extractPurchaseReceipt, isPurchaseSupported } from "@/services/iap-service";

vi.mock("@/services/native-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/native-service")>();
  return { ...actual, getPlatform: () => "android" as const };
});

describe("iap-service on Android", () => {
  beforeEach(() => {
    __resetIapServiceForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats Android as a purchase platform", () => {
    expect(isPurchaseSupported()).toBe(false); // not native: Capacitor is absent in tests
  });

  it("extracts the purchase token from the plugin's native purchase", () => {
    const receipt = extractPurchaseReceipt({
      transactionId: "GPA.3311-1234-5678-90123",
      purchaseId: "aefhjkkdmnoggpel.1.0.0",
      nativePurchase: { purchaseToken: "aefhjkkdmnoggpel.1.0.0", orderId: "GPA.3311-1234-5678-90123" },
    });
    expect(receipt.purchaseToken).toBe("aefhjkkdmnoggpel.1.0.0");
    expect(receipt.orderId).toBe("GPA.3311-1234-5678-90123");
  });

  it("falls back to purchaseId when nativePurchase is missing", () => {
    const receipt = extractPurchaseReceipt({
      transactionId: "GPA.1",
      purchaseId: "token-from-receipt",
    });
    expect(receipt.purchaseToken).toBe("token-from-receipt");
    expect(receipt.orderId).toBeNull();
  });

  it("returns nulls for Apple transactions", () => {
    const receipt = extractPurchaseReceipt({ transactionId: "2000000123456789" });
    expect(receipt.purchaseToken).toBeNull();
    expect(receipt.orderId).toBeNull();
  });
});
