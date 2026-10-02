/**
 * Server-only verification of Google Play Billing purchases and
 * subscriptions, through the Google Play Developer API.
 *
 * Runs behind the paywall server functions and the stable native REST route.
 * The service account credential is read from the
 * GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secret; the package name comes from
 * GOOGLE_PLAY_PACKAGE_NAME. Neither is ever exposed to the client.
 *
 * Kept separate from `apple-iap.server.ts` so each store keeps its own
 * verification module with the same error-code contract.
 */

import { PREMIUM_PRODUCT_ID } from "@/config/purchase";

const ANDROIDPUBLISHER_BASE = "https://androidpublisher.googleapis.com";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_JWT_AUDIENCE = "https://oauth2.googleapis.com/token";
const ANDROIDPUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export type GoogleVerificationCode =
  | "not-configured"
  | "not-found"
  | "wrong-product"
  | "revoked"
  | "pending"
  | "google-error";

export class GoogleVerificationError extends Error {
  readonly code: GoogleVerificationCode;
  constructor(code: GoogleVerificationCode, message: string) {
    super(message);
    this.name = "GoogleVerificationError";
    this.code = code;
  }
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function requireConfig(): { serviceAccount: ServiceAccount; packageName: string } {
  const raw = process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"];
  const packageName = process.env["GOOGLE_PLAY_PACKAGE_NAME"];
  if (!raw || !packageName) {
    throw new GoogleVerificationError(
      "not-configured",
      "Google Play verification is not configured",
    );
  }
  return { serviceAccount: parseServiceAccountJson(raw), packageName };
}

/**
 * Parses the service-account key JSON. Some secret stores escape newlines, so
 * a private_key containing literal "\n" sequences is unescaped first.
 */
export function parseServiceAccountJson(raw: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GoogleVerificationError("not-configured", "Invalid service account JSON");
  }
  const account = (parsed ?? {}) as { client_email?: unknown; private_key?: unknown };
  const clientEmail = typeof account.client_email === "string" ? account.client_email : null;
  const privateKey = typeof account.private_key === "string" ? account.private_key : null;
  if (!clientEmail || !privateKey) {
    throw new GoogleVerificationError(
      "not-configured",
      "Service account JSON is missing client_email or private_key",
    );
  }
  return {
    client_email: clientEmail,
    private_key: privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey,
  };
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/* ------------------------------------------------------------------ *
 * OAuth2 access token (RS256 service-account JWT, cached)
 * ------------------------------------------------------------------ */

let cachedToken: { token: string; expiresAtMs: number } | null = null;

/** Test-only: clears the cached Google access token. */
export function __resetGooglePlayTokenCacheForTests() {
  cachedToken = null;
}

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: ANDROIDPUBLISHER_SCOPE,
      aud: OAUTH_JWT_AUDIENCE,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signerInput = `${header}.${claims}`;
  let signature: string;
  try {
    // Web Crypto: node:crypto signing is unreliable in the published runtime.
    const der = Buffer.from(
      serviceAccount.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""),
      "base64",
    );
    const key = await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const raw = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signerInput),
    );
    signature = base64Url(Buffer.from(raw));
  } catch (error) {
    throw new GoogleVerificationError(
      "not-configured",
      `Service account private key is unusable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const assertion = `${signerInput}.${signature}`;

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!response.ok) {
    throw new GoogleVerificationError(
      "google-error",
      `Google OAuth token request failed: ${response.status}`,
    );
  }
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string") {
    throw new GoogleVerificationError("google-error", "Google OAuth response missing token");
  }
  const expiresIn =
    typeof body.expires_in === "number" ? body.expires_in : 3600;
  cachedToken = {
    token: body.access_token,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };
  return cachedToken.token;
}

/* ------------------------------------------------------------------ *
 * One-off (consumable) product purchases
 * ------------------------------------------------------------------ */

export interface GoogleVerifiedPurchase {
  purchaseToken: string;
  productId: string;
  orderId: string | null;
  purchasedAt: string;
}

/**
 * Verifies a one-off product purchase against the Google Play Developer API.
 *
 * The token alone is not enough for products — the API needs the product id in
 * the path — so every candidate id is tried. A purchase counts as valid only
 * when Google returns it with purchaseState 0 (purchased) for one of the
 * candidate products.
 */
export async function verifyGoogleProductPurchase(
  purchaseToken: string,
  productIds: string[],
): Promise<GoogleVerifiedPurchase> {
  if (productIds.length === 0) {
    throw new GoogleVerificationError("wrong-product", "No product id to verify against");
  }
  const { serviceAccount, packageName } = requireConfig();
  const accessToken = await getAccessToken(serviceAccount);

  let sawPending = false;
  let sawNotFound = 0;
  for (const productId of productIds) {
    const url = `${ANDROIDPUBLISHER_BASE}/androidpublisher/v3/applications/${encodeURIComponent(
      packageName,
    )}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(
      purchaseToken,
    )}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 404) {
      sawNotFound += 1;
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new GoogleVerificationError(
        "google-error",
        "Google Play rejected the service account credentials",
      );
    }
    if (!response.ok) {
      throw new GoogleVerificationError(
        "google-error",
        `Google Play responded ${response.status}`,
      );
    }
    const body = (await response.json()) as {
      purchaseState?: unknown;
      purchaseTime?: unknown;
      orderId?: unknown;
    };
    const purchaseState = Number(body.purchaseState);
    if (purchaseState === 2) {
      // Payment pending (cash payment, slow authorisation) — retryable.
      sawPending = true;
      continue;
    }
    if (purchaseState !== 0) {
      throw new GoogleVerificationError(
        "revoked",
        `Purchase state ${purchaseState} is not a valid purchase`,
      );
    }
    return {
      purchaseToken,
      productId,
      orderId: typeof body.orderId === "string" ? body.orderId : null,
      purchasedAt:
        Number.isFinite(Number(body.purchaseTime)) && Number(body.purchaseTime) > 0
          ? new Date(Number(body.purchaseTime)).toISOString()
          : new Date().toISOString(),
    };
  }
  if (sawPending) {
    throw new GoogleVerificationError("pending", "Purchase is awaiting payment");
  }
  if (sawNotFound === productIds.length) {
    throw new GoogleVerificationError(
      "not-found",
      "Purchase token not found for any known product",
    );
  }
  throw new GoogleVerificationError("google-error", "Purchase could not be verified");
}

/* ------------------------------------------------------------------ *
 * Subscriptions (subscriptionsv2)
 * ------------------------------------------------------------------ */

export interface GoogleSubscriptionState {
  active: boolean;
  productId: string;
  transactionId: string;
  environment: string;
  expiresAt: string | null;
  autoRenew: boolean;
  revokedAt: string | null;
  /** Lower-case subscription state, e.g. "active", "canceled", "revoked". */
  status: string;
}

interface SubscriptionsV2Response {
  purchaseState?: unknown;
  lastPurchaseToken?: unknown;
  expiryTime?: unknown;
  subscriptionState?: unknown;
  lineItems?: {
    productId?: unknown;
    expiryTime?: unknown;
    subscriptionState?: unknown;
    autoRenewingPlan?: { autoRenewEnabled?: unknown } | null;
  }[];
}

/**
 * Maps a `purchases.subscriptionsv2.get` response to the subscription state
 * used by the paywall. Pure function — exported for tests.
 *
 * A canceled subscription (purchaseState 1) stays active until its paid period
 * ends, so only pending payment (2) blocks a currently paid period.
 */
export function mapGoogleSubscriptionState(
  body: unknown,
  purchaseToken: string,
): GoogleSubscriptionState {
  const data = (body ?? {}) as SubscriptionsV2Response;
  const line = data.lineItems?.[0];
  const rawState = String(
    line?.subscriptionState ?? data.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED",
  );
  const status = rawState.replace(/^SUBSCRIPTION_STATE_/, "").toLowerCase();
  const expiryRaw = line?.expiryTime ?? data.expiryTime ?? null;
  const expiresAt =
    typeof expiryRaw === "string" && expiryRaw ? new Date(expiryRaw).toISOString() : null;
  const autoRenew = line?.autoRenewingPlan?.autoRenewEnabled === true;
  const purchaseState = Number(data.purchaseState ?? 0);
  const paidPeriod = purchaseState !== 2;
  const active =
    paidPeriod &&
    (rawState === "SUBSCRIPTION_STATE_ACTIVE" ||
      rawState === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") &&
    Boolean(expiresAt) &&
    new Date(expiresAt as string).getTime() > Date.now();
  return {
    active,
    productId:
      typeof line?.productId === "string" && line.productId
        ? line.productId
        : PREMIUM_PRODUCT_ID,
    transactionId:
      typeof data.lastPurchaseToken === "string" && data.lastPurchaseToken
        ? data.lastPurchaseToken
        : purchaseToken,
    environment: "google-play",
    expiresAt,
    autoRenew,
    revokedAt: rawState === "SUBSCRIPTION_STATE_REVOKED" ? (expiresAt ?? null) : null,
    status,
  };
}

/** Live subscription state straight from Google. */
export async function getGoogleSubscriptionState(
  purchaseToken: string,
): Promise<GoogleSubscriptionState> {
  const { serviceAccount, packageName } = requireConfig();
  const accessToken = await getAccessToken(serviceAccount);
  const url = `${ANDROIDPUBLISHER_BASE}/androidpublisher/v3/applications/${encodeURIComponent(
    packageName,
  )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404) {
    throw new GoogleVerificationError("not-found", "Subscription token not found");
  }
  if (response.status === 401 || response.status === 403) {
    throw new GoogleVerificationError(
      "google-error",
      "Google Play rejected the service account credentials",
    );
  }
  if (!response.ok) {
    throw new GoogleVerificationError(
      "google-error",
      `Google Play responded ${response.status}`,
    );
  }
  return mapGoogleSubscriptionState(await response.json(), purchaseToken);
}
