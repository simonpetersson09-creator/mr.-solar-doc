import { describe, expect, it } from "vitest";
import {
  PREMIUM_PRODUCT_ID,
  PREMIUM_PRODUCT_IDS,
  UNLOCK_PRODUCT_ID,
  isPremiumProductId,
} from "@/config/purchase";

/**
 * These ids must match App Store Connect character for character. A mismatch
 * means StoreKit never delivers the product and every purchase attempt fails
 * with an error — which is what App Review saw.
 */
describe("product ids", () => {
  it("matches the App Store Connect product ids", () => {
    expect(UNLOCK_PRODUCT_ID).toBe("com.mrsolardoc.calculation.unlock");
    expect(PREMIUM_PRODUCT_ID).toBe("com.mrsolardoc.premium.yearly");
  });

  it("accepts exactly the subscription id when verifying", () => {
    expect(PREMIUM_PRODUCT_IDS).toEqual(["com.mrsolardoc.premium.yearly"]);
    expect(isPremiumProductId("com.mrsolardoc.premium.yearly")).toBe(true);
    expect(isPremiumProductId("premium.yearly")).toBe(false);
    expect(isPremiumProductId(UNLOCK_PRODUCT_ID)).toBe(false);
    expect(isPremiumProductId(null)).toBe(false);
  });
});
