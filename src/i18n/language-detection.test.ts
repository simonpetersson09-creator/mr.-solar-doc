import { beforeEach, describe, expect, it } from "vitest";
import { detectInitialLanguage } from "./languages";
import { DEFAULT_SETTINGS, resolveInitialLanguage, saveSettings } from "@/services/settings-service";

describe("detectInitialLanguage", () => {
  it("maps sv-SE to sv", () => {
    expect(detectInitialLanguage(["sv-SE"])).toBe("sv");
  });

  it("maps da-DK to da", () => {
    expect(detectInitialLanguage(["da-DK"])).toBe("da");
  });

  it("maps de-AT to the base language de", () => {
    expect(detectInitialLanguage(["de-AT"])).toBe("de");
  });

  it("maps en-GB to en", () => {
    expect(detectInitialLanguage(["en-GB"])).toBe("en");
  });

  it("falls back to English for unsupported locales", () => {
    expect(detectInitialLanguage(["zz-ZZ"])).toBe("en");
    expect(detectInitialLanguage([])).toBe("en");
  });

  it("uses the first supported entry in the preference list", () => {
    expect(detectInitialLanguage(["zz-ZZ", "fr-CA", "de-DE"])).toBe("fr");
  });
});

describe("resolveInitialLanguage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, "languages", {
      value: ["da-DK", "en-GB"],
      configurable: true,
    });
  });

  it("uses the device language when nothing was chosen manually", () => {
    expect(resolveInitialLanguage()).toBe("da");
  });

  it("lets a manually saved language win over the device language", () => {
    saveSettings({ ...DEFAULT_SETTINGS, language: "pl", languageChosenManually: true });
    expect(resolveInitialLanguage()).toBe("pl");
  });

  it("keeps settings saved by older versions working", () => {
    window.localStorage.setItem(
      "solenergikollen.settings",
      JSON.stringify({ language: "sv", theme: "light" }),
    );
    expect(resolveInitialLanguage()).toBe("sv");
  });

  it("does not depend on the analysed country", () => {
    // Changing country data never touches app settings, so language is stable.
    expect(resolveInitialLanguage()).toBe("da");
    window.localStorage.setItem("solenergikollen.country", "DE");
    expect(resolveInitialLanguage()).toBe("da");
  });
});
