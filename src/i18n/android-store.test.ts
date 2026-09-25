import { describe, expect, it } from "vitest";
import { ANDROID_STORE_KEYS, androidStoreTranslations, storeTextKey } from "./android-store";
import { SUPPORTED_LANGUAGES } from "./languages";

describe("Android Google Play wording", () => {
  it("covers every supported language with every key", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const copy = androidStoreTranslations[lang];
      expect(copy, lang).toBeDefined();
      for (const key of ANDROID_STORE_KEYS) {
        expect(copy![key].trim().length, `${lang}.${key}`).toBeGreaterThan(0);
        expect(copy![key], `${lang}.${key}`).not.toMatch(/App Store|Apple|iPhone|iOS/);
      }
    }
  });

  it("keeps the App Store keys everywhere except Android", () => {
    expect(storeTextKey(false, "storeNote", "paywall.appleNote")).toBe("paywall.appleNote");
    expect(storeTextKey(true, "storeNote", "paywall.appleNote")).toBe("androidStore.storeNote");
  });
});
