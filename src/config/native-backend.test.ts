import { describe, expect, it } from "vitest";

import { NATIVE_BACKEND_URL, resolveNativeBackendUrl } from "./native-backend";

describe("resolveNativeBackendUrl", () => {
  const nativeFrontend = "capacitor://localhost/address";
  const serverFnPath = "/_serverFn/geocode?payload=encoded";

  it("rewrites relative server-function paths from the iOS bundle", () => {
    expect(resolveNativeBackendUrl(serverFnPath, nativeFrontend)).toBe(
      `${NATIVE_BACKEND_URL}${serverFnPath}`,
    );
  });

  it("rewrites absolute capacitor URLs despite their opaque origin", () => {
    expect(
      resolveNativeBackendUrl(`capacitor://localhost${serverFnPath}`, nativeFrontend),
    ).toBe(`${NATIVE_BACKEND_URL}${serverFnPath}`);
  });

  it("leaves external provider URLs unchanged", () => {
    const external = "https://example.com/search?q=stockholm";
    expect(resolveNativeBackendUrl(external, nativeFrontend)).toBe(external);
  });
});