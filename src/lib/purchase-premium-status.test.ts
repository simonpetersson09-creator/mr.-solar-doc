import { describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ result: { data: [] as unknown[] | null, error: null as unknown } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => mock.result }) }) }) }),
} }));
import { getPremiumStatusProvider } from "./purchase.server";
describe("Premium entitlement uncertainty", () => {
  it("database error cannot report confirmed non-Premium", async () => {
    mock.result = { data: null, error: { message: "connection failed" } };
    await expect(getPremiumStatusProvider({ deviceId: "test-device" })).rejects.toThrow("Premium status unavailable");
  });
  it("successful empty subscription query reports non-Premium", async () => {
    mock.result = { data: [], error: null };
    await expect(getPremiumStatusProvider({ deviceId: "test-device" })).resolves.toEqual({ active: false, expiresAt: null, autoRenew: false, stale: false });
  });
});