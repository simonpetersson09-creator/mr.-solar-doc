import { expect, it, vi } from "vitest";
import { getAdDiagnostics, recordAdDiagnostic } from "./ad-diagnostics";
it("diagnostics are bounded and distinguish attempts from native confirmed opens", () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  for (let i = 0; i < 101; i++) recordAdDiagnostic("request");
  recordAdDiagnostic("show_attempt"); recordAdDiagnostic("opened"); recordAdDiagnostic("failed_load", "no_fill", 3);
  const entries = getAdDiagnostics();
  expect(entries).toHaveLength(100);
  expect(entries.slice(-3).map((entry) => entry.stage)).toEqual(["show_attempt", "opened", "failed_load"]);
  expect(entries.at(-1)?.code).toBe(3);
  expect(Object.keys(entries.at(-1) ?? {}).sort()).toEqual(["at", "code", "reason", "stage"]);
  vi.restoreAllMocks();
});