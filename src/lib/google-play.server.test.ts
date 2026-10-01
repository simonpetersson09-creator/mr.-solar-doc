import { describe, expect, it } from "vitest";

import {
  GoogleVerificationError,
  mapGoogleSubscriptionState,
  parseServiceAccountJson,
} from "@/lib/google-play.server";

describe("parseServiceAccountJson", () => {
  it("parses a normal service account JSON", () => {
    const account = parseServiceAccountJson(
      JSON.stringify({ client_email: "sa@example.iam.gserviceaccount.com", private_key: "-----BEGIN" }),
    );
    expect(account.client_email).toBe("sa@example.iam.gserviceaccount.com");
    expect(account.private_key).toBe("-----BEGIN");
  });

  it("unescapes literal \\n sequences in the private key", () => {
    const account = parseServiceAccountJson(
      JSON.stringify({ client_email: "sa@example.iam.gserviceaccount.com", private_key: "a\\nb\\n" }),
    );
    expect(account.private_key).toBe("a\nb\n");
  });

  it("rejects invalid JSON with not-configured", () => {
    try {
      parseServiceAccountJson("{not json");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleVerificationError);
      expect((error as GoogleVerificationError).code).toBe("not-configured");
    }
  });

  it("rejects JSON without the required fields", () => {
    expect(() => parseServiceAccountJson(JSON.stringify({ client_email: "x" }))).toThrow(
      GoogleVerificationError,
    );
  });
});

describe("mapGoogleSubscriptionState", () => {
  const token = "token-abc";

  it("marks an active, renewing subscription as active", () => {
    const state = mapGoogleSubscriptionState(
      {
        purchaseState: 0,
        subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
        lineItems: [
          {
            productId: "com.mrsolardoc.premium.yearly",
            expiryTime: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
            autoRenewingPlan: { autoRenewEnabled: true },
          },
        ],
      },
      token,
    );
    expect(state.active).toBe(true);
    expect(state.status).toBe("active");
    expect(state.autoRenew).toBe(true);
    expect(state.productId).toBe("com.mrsolardoc.premium.yearly");
    expect(state.transactionId).toBe(token);
  });

  it("keeps a canceled subscription active until the paid period ends", () => {
    const state = mapGoogleSubscriptionState(
      {
        purchaseState: 1,
        subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
        lineItems: [
          {
            productId: "com.mrsolardoc.premium.yearly",
            expiryTime: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
            autoRenewingPlan: { autoRenewEnabled: false },
          },
        ],
      },
      token,
    );
    expect(state.active).toBe(true);
    expect(state.autoRenew).toBe(false);
  });

  it("marks an expired period as inactive", () => {
    const state = mapGoogleSubscriptionState(
      {
        purchaseState: 0,
        subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
        lineItems: [
          {
            productId: "com.mrsolardoc.premium.yearly",
            expiryTime: new Date(Date.now() - 1000).toISOString(),
            autoRenewingPlan: { autoRenewEnabled: true },
          },
        ],
      },
      token,
    );
    expect(state.active).toBe(false);
  });

  it("treats pending payment as an unpaid period", () => {
    const state = mapGoogleSubscriptionState(
      {
        purchaseState: 2,
        subscriptionState: "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
        lineItems: [
          {
            productId: "com.mrsolardoc.premium.yearly",
            expiryTime: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          },
        ],
      },
      token,
    );
    expect(state.active).toBe(false);
  });

  it("marks a revoked subscription and keeps the grace period active", () => {
    const revoked = mapGoogleSubscriptionState(
      {
        purchaseState: 0,
        subscriptionState: "SUBSCRIPTION_STATE_REVOKED",
        lineItems: [{ productId: "com.mrsolardoc.premium.yearly" }],
      },
      token,
    );
    expect(revoked.active).toBe(false);
    expect(revoked.status).toBe("revoked");

    const grace = mapGoogleSubscriptionState(
      {
        purchaseState: 0,
        subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
        lineItems: [
          {
            productId: "com.mrsolardoc.premium.yearly",
            expiryTime: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
            autoRenewingPlan: { autoRenewEnabled: true },
          },
        ],
      },
      token,
    );
    expect(grace.active).toBe(true);
  });

  it("falls back to the premium product id when the line item is missing", () => {
    const state = mapGoogleSubscriptionState({}, token);
    expect(state.productId).toBe("com.mrsolardoc.premium.yearly");
    expect(state.active).toBe(false);
  });
});
