import { describe, expect, it } from "vitest";
import { isPlaceholderTransactionId } from "@/services/iap-service";

describe("isPlaceholderTransactionId", () => {
  it("skips the app receipt and in-progress placeholders", () => {
    expect(isPlaceholderTransactionId("appstore.application")).toBe(true);
    expect(isPlaceholderTransactionId("virtual.com.mrsolardoc.premium.yearly")).toBe(true);
  });
  it("keeps real App Store and Google Play ids", () => {
    expect(isPlaceholderTransactionId("2000000912345678")).toBe(false);
    expect(isPlaceholderTransactionId("GPA.1234-5678-9012-34567")).toBe(false);
    expect(isPlaceholderTransactionId(null)).toBe(false);
  });
});
