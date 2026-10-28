import { afterEach, expect, it, vi } from "vitest";
import { getPrivacyDiagnostics, tracePrivacyStep } from "./ad-privacy-diagnostics";
afterEach(() => vi.restoreAllMocks());
it("retains actual native codes but never error text or consent responses", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const error = { code: 3, message: "private@example.com purposeConsents=1001", data: { purposeConsents: "1001" } };
  await expect(tracePrivacyStep("ump_update", async () => { throw error; })).rejects.toBe(error);
  expect(getPrivacyDiagnostics().at(-1)).toEqual({ step: "ump_update", outcome: "failed", code: 3, reason: "operation_rejected" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private@example.com");
  expect(JSON.stringify(log.mock.calls)).not.toContain("1001");
  await tracePrivacyStep("native_snapshot", async () => ({ purposeConsents: "secret-bits" }));
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret-bits");
});
it("recognizes missing native methods without recording arbitrary string codes", async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  await expect(tracePrivacyStep("native_snapshot", async () => { throw { code: "UNIMPLEMENTED", message: "getConsentSnapshot is not implemented" }; })).rejects.toBeDefined();
  expect(getPrivacyDiagnostics().at(-1)).toMatchObject({ code: "UNIMPLEMENTED", reason: "not_implemented" });
  await expect(tracePrivacyStep("entitlement", async () => { throw { code: "private@example.com" }; })).rejects.toBeDefined();
  expect(getPrivacyDiagnostics().at(-1)?.code).toBeUndefined();
});