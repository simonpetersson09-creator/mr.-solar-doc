import { describe, expect, it, afterEach, vi } from "vitest";
import { isDevUnlock } from "./dev-unlock";

/**
 * The bypass is allowed in development and on the private Lovable preview
 * hosts only. A published site — custom domain or a plain *.lovable.app host —
 * must always keep the paywall.
 */
describe("isDevUnlock", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is enabled in development", () => {
    vi.stubEnv("DEV", true);
    expect(isDevUnlock()).toBe(true);
  });

  it.each(["id-preview--68a192c2.lovable.app", "myapp.lovableproject.com"])(
    "is enabled on the private preview host %s",
    (hostname) => {
      vi.stubEnv("DEV", false);
      vi.stubGlobal("location", { hostname });
      expect(isDevUnlock()).toBe(true);
    },
  );

  it.each([
    "ray-design-app.lovable.app",
    "mrsolardoc.com",
    "www.mrsolardoc.com",
    "evil-lovableproject.com",
    "id-preview--abc.evil.com",
  ])("stays disabled on published hostname %s", (hostname) => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("location", { hostname });
    expect(isDevUnlock()).toBe(false);
  });

  it("is disabled in a production build without a location", () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("location", undefined);
    expect(isDevUnlock()).toBe(false);
  });
});
