import { describe, expect, it, afterEach, vi } from "vitest";
import { isDevUnlock } from "./dev-unlock";

/**
 * The dev bypass must be impossible to activate outside an explicit
 * development environment — no hostname (public preview, published site,
 * a spoofed *.lovableproject.com domain) may unlock the paywall.
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

  it("is disabled in a production build", () => {
    vi.stubEnv("DEV", false);
    expect(isDevUnlock()).toBe(false);
  });

  it.each([
    "localhost",
    "127.0.0.1",
    "id-preview--abc.lovable.app",
    "myapp.lovableproject.com",
    "mrsolardoc.com",
  ])("stays disabled in production on hostname %s", (hostname) => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("location", { hostname });
    expect(isDevUnlock()).toBe(false);
  });

  it("never reads the hostname to decide", () => {
    vi.stubEnv("DEV", false);
    const hostname = vi.fn(() => "localhost");
    vi.stubGlobal("location", {
      get hostname() {
        return hostname();
      },
    });
    isDevUnlock();
    expect(hostname).not.toHaveBeenCalled();
  });
});
