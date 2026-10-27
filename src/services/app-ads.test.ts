import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("app website publishes the authorized publisher row without changing legal website", () => {
  expect(readFileSync("public/app-ads.txt", "utf8")).toBe("google.com, pub-7448540924654868, DIRECT, f08c47fec0942fa0\n");
});