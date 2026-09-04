/**
 * Server-only verification of Apple In-App Purchases (StoreKit 2).
 *
 * The client never decides whether a calculation is paid. It only hands over a
 * transaction id; this module asks Apple's App Store Server API for the signed
 * transaction and validates bundle, product and revocation state.
 */

import { createPrivateKey, sign as cryptoSign } from "node:crypto";

const PRODUCTION_BASE = "https://api.storekit.itunes.apple.com";
const SANDBOX_BASE = "https://api.storekit-sandbox.itunes.apple.com";

export interface VerifiedTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  environment: "Production" | "Sandbox";
  purchasedAt: string;
  /** Subscription expiry from the signed transaction, when Apple provides one. */
  expiresAt: string | null;
}

export class AppleVerificationError extends Error {
  readonly code:
    | "not-configured"
    | "not-found"
    | "revoked"
    | "wrong-product"
    | "wrong-bundle"
    | "apple-error";

  constructor(code: AppleVerificationError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "AppleVerificationError";
  }
}

interface AppleConfig {
  issuerId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
}

/**
 * Rebuilds a valid PEM from a pasted .p8 key.
 *
 * Secret forms are usually single-line, so the key can arrive with real
 * newlines, escaped "\n" sequences, spaces instead of newlines, or as bare
 * base64 with no header at all. All of those are normalised here into the
 * strict 64-character-per-line PEM that createPrivateKey requires.
 */
function normalizePrivateKey(raw: string): string {
  const unescaped = raw.trim().replace(/\\r/g, "").replace(/\\n/g, "\n");
  const header = /-----BEGIN ([A-Z ]+)-----/.exec(unescaped);
  const label = header?.[1] ?? "PRIVATE KEY";

  // Strip headers/footers and every kind of whitespace to recover the base64 body.
  const body = unescaped
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  if (!body) {
    throw new AppleVerificationError(
      "not-configured",
      "Apple private key is empty or malformed.",
    );
  }

  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function readConfig(): AppleConfig {
  const issuerId = process.env["APPLE_IAP_ISSUER_ID"]?.trim();
  const keyId = process.env["APPLE_IAP_KEY_ID"]?.trim();
  const privateKey = process.env["APPLE_IAP_PRIVATE_KEY"];
  const bundleId = process.env["APPLE_IAP_BUNDLE_ID"]?.trim();
  if (!issuerId || !keyId || !privateKey || !bundleId) {
    throw new AppleVerificationError(
      "not-configured",
      "Apple In-App Purchase credentials are not configured.",
    );
  }
  return { issuerId, keyId, privateKey: normalizePrivateKey(privateKey), bundleId };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createAppleJwt(config: AppleConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(
    JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }),
  );
  const payload = base64Url(
    JSON.stringify({
      iss: config.issuerId,
      iat: now,
      exp: now + 15 * 60,
      aud: "appstoreconnect-v1",
      bid: config.bundleId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64Url(signature)}`;
}

interface SignedTransactionPayload {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  environment?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
}

function decodeJwsPayload(jws: string): SignedTransactionPayload {
  const [rawHeader, part] = jws.split(".");
  if (!rawHeader || !part) {
    throw new AppleVerificationError("apple-error", "Malformed signed transaction.");
  }
  // The payload comes from Apple's authenticated API over TLS, but we still
  // sanity check that it is the expected ES256/x5c-signed App Store token.
  const header = JSON.parse(Buffer.from(rawHeader, "base64").toString("utf8")) as {
    alg?: string;
    x5c?: string[];
  };
  if (header.alg !== "ES256" || !header.x5c?.length) {
    throw new AppleVerificationError("apple-error", "Unexpected signed transaction header.");
  }
  return JSON.parse(Buffer.from(part, "base64").toString("utf8")) as SignedTransactionPayload;
}


async function fetchTransaction(
  baseUrl: string,
  transactionId: string,
  token: string,
): Promise<{ status: number; signedTransactionInfo?: string }> {
  const response = await fetch(
    `${baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return { status: response.status };
  const body = (await response.json()) as { signedTransactionInfo?: string };
  return body.signedTransactionInfo
    ? { status: response.status, signedTransactionInfo: body.signedTransactionInfo }
    : { status: response.status };
}

const LOOKUP_RETRY_DELAYS_MS = [700, 1500, 2500, 4000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Verifies one transaction id against Apple. Production is checked first, then
 * sandbox, so TestFlight and App Review purchases work without configuration.
 *
 * Apple does not expose a brand new transaction to the App Store Server API
 * instantly — in Sandbox (TestFlight and App Review) the first lookups often
 * return 404 for a few seconds. Without retries that raced the reviewer's tap
 * and surfaced as "unable to complete the purchase", so we poll briefly before
 * giving up.
 */
export async function verifyAppleTransaction(
  transactionId: string,
  expectedProductId: string | string[],
): Promise<VerifiedTransaction> {
  const config = readConfig();
  const token = createAppleJwt(config);
  const expected = Array.isArray(expectedProductId) ? expectedProductId : [expectedProductId];

  let environmentHint: "Production" | "Sandbox" = "Production";
  let result = await fetchTransaction(PRODUCTION_BASE, transactionId, token);
  if (result.status === 404) {
    environmentHint = "Sandbox";
    result = await fetchTransaction(SANDBOX_BASE, transactionId, token);
  }
  for (const delay of LOOKUP_RETRY_DELAYS_MS) {
    if (result.status !== 404) break;
    await wait(delay);
    result = await fetchTransaction(PRODUCTION_BASE, transactionId, token);
    if (result.status === 404) {
      environmentHint = "Sandbox";
      result = await fetchTransaction(SANDBOX_BASE, transactionId, token);
    } else {
      environmentHint = "Production";
    }
  }
  if (result.status === 404) {
    throw new AppleVerificationError("not-found", "Transaction not found at Apple.");
  }

  if (!result.signedTransactionInfo) {
    throw new AppleVerificationError(
      "apple-error",
      `Apple returned status ${String(result.status)}.`,
    );
  }

  const payload = decodeJwsPayload(result.signedTransactionInfo);
  if (payload.bundleId !== config.bundleId) {
    throw new AppleVerificationError("wrong-bundle", "Transaction belongs to another app.");
  }
  if (!payload.productId || !expected.includes(payload.productId)) {
    throw new AppleVerificationError("wrong-product", "Transaction is for another product.");
  }
  if (payload.revocationDate) {
    throw new AppleVerificationError("revoked", "Transaction was refunded or revoked.");
  }

  return {
    transactionId: payload.transactionId ?? transactionId,
    originalTransactionId: payload.originalTransactionId ?? transactionId,
    productId: payload.productId,
    bundleId: payload.bundleId,
    environment:
      payload.environment === "Sandbox" || payload.environment === "Production"
        ? payload.environment
        : environmentHint,
    purchasedAt: new Date(payload.purchaseDate ?? Date.now()).toISOString(),
    expiresAt: payload.expiresDate ? new Date(payload.expiresDate).toISOString() : null,
  };
}

/* ------------------------------------------------------------------ */
/* Auto-renewable subscription status                                   */
/* ------------------------------------------------------------------ */

export interface SubscriptionState {
  /** True when the subscription currently entitles the user to Premium. */
  active: boolean;
  /** Apple's raw status: 1 active, 2 expired, 3 billing retry, 4 grace, 5 revoked. */
  appleStatus: number;
  productId: string | null;
  originalTransactionId: string;
  transactionId: string | null;
  environment: "Production" | "Sandbox";
  expiresAt: string | null;
  autoRenew: boolean;
  revokedAt: string | null;
}

interface SubscriptionStatusResponse {
  data?: {
    lastTransactions?: {
      status?: number;
      originalTransactionId?: string;
      signedTransactionInfo?: string;
      signedRenewalInfo?: string;
    }[];
  }[];
}

async function fetchSubscriptionStatuses(
  baseUrl: string,
  originalTransactionId: string,
  token: string,
): Promise<{ status: number; body?: SubscriptionStatusResponse }> {
  const response = await fetch(
    `${baseUrl}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return { status: response.status };
  return { status: response.status, body: (await response.json()) as SubscriptionStatusResponse };
}

/**
 * Asks Apple for the live state of a subscription.
 *
 * Entitlement follows Apple's status codes: 1 (active) and 4 (grace period)
 * grant access, 3 (billing retry) only while the paid period has not ended,
 * 2 (expired) and 5 (revoked) never do. Auto-renew being switched off does not
 * remove access until the period actually ends.
 */
export async function getAppleSubscriptionState(
  originalTransactionId: string,
  expectedProductId: string,
): Promise<SubscriptionState> {
  const config = readConfig();
  const token = createAppleJwt(config);

  let environment: "Production" | "Sandbox" = "Production";
  let result = await fetchSubscriptionStatuses(PRODUCTION_BASE, originalTransactionId, token);
  if (result.status === 404) {
    environment = "Sandbox";
    result = await fetchSubscriptionStatuses(SANDBOX_BASE, originalTransactionId, token);
  }
  // Same Sandbox propagation delay as for single transactions.
  for (const delay of LOOKUP_RETRY_DELAYS_MS) {
    if (result.status !== 404) break;
    await wait(delay);
    result = await fetchSubscriptionStatuses(PRODUCTION_BASE, originalTransactionId, token);
    if (result.status === 404) {
      environment = "Sandbox";
      result = await fetchSubscriptionStatuses(SANDBOX_BASE, originalTransactionId, token);
    } else {
      environment = "Production";
    }
  }
  if (result.status === 404) {
    throw new AppleVerificationError("not-found", "Subscription not found at Apple.");
  }
  if (!result.body) {
    throw new AppleVerificationError(
      "apple-error",
      `Apple returned status ${String(result.status)}.`,
    );
  }

  const entry = result.body.data
    ?.flatMap((group) => group.lastTransactions ?? [])
    .find((item) => item.originalTransactionId === originalTransactionId)
    ?? result.body.data?.flatMap((group) => group.lastTransactions ?? [])[0];

  if (!entry?.signedTransactionInfo) {
    throw new AppleVerificationError("not-found", "No subscription transaction from Apple.");
  }

  const payload = decodeJwsPayload(entry.signedTransactionInfo);
  if (payload.bundleId !== config.bundleId) {
    throw new AppleVerificationError("wrong-bundle", "Subscription belongs to another app.");
  }
  if (payload.productId !== expectedProductId) {
    throw new AppleVerificationError("wrong-product", "Subscription is for another product.");
  }

  const renewal = entry.signedRenewalInfo
    ? (decodeJwsPayload(entry.signedRenewalInfo) as { autoRenewStatus?: number })
    : {};
  const appleStatus = entry.status ?? 0;
  const expiresAt = payload.expiresDate ? new Date(payload.expiresDate).toISOString() : null;
  const notExpired = payload.expiresDate ? payload.expiresDate > Date.now() : false;
  const revoked = Boolean(payload.revocationDate) || appleStatus === 5;

  return {
    active:
      !revoked &&
      (appleStatus === 1 || appleStatus === 4 || (appleStatus === 3 && notExpired)),
    appleStatus,
    productId: payload.productId ?? null,
    originalTransactionId: payload.originalTransactionId ?? originalTransactionId,
    transactionId: payload.transactionId ?? null,
    environment:
      payload.environment === "Sandbox" || payload.environment === "Production"
        ? payload.environment
        : environment,
    expiresAt,
    autoRenew: renewal.autoRenewStatus === 1,
    revokedAt: payload.revocationDate ? new Date(payload.revocationDate).toISOString() : null,
  };
}

