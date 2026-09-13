import { describe, expect, it } from "vitest";
import { resolveRequestLanguage } from "./request-language";

describe("resolveRequestLanguage", () => {
  it("falls back to English without headers", () => {
    expect(resolveRequestLanguage({})).toBe("en");
  });

  it("uses the saved language cookie", () => {
    expect(resolveRequestLanguage({ cookie: "a=1; msd_lang=sv; b=2" })).toBe("sv");
  });

  it("prefers the cookie over the browser preference", () => {
    expect(
      resolveRequestLanguage({ cookie: "msd_lang=de", acceptLanguage: "sv-SE,sv;q=0.9" }),
    ).toBe("de");
  });

  it("uses the browser preference when no cookie is set", () => {
    expect(resolveRequestLanguage({ acceptLanguage: "sv-SE,sv;q=0.9,en;q=0.8" })).toBe("sv");
  });

  it("skips unsupported browser languages", () => {
    expect(resolveRequestLanguage({ acceptLanguage: "zz-ZZ,uk;q=0.8" })).toBe("uk");
  });

  it("ignores an unsupported cookie value", () => {
    expect(resolveRequestLanguage({ cookie: "msd_lang=zz", acceptLanguage: "he-IL" })).toBe("he");
  });
});
