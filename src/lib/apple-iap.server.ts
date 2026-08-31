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

function readConfig(): AppleConfig {
  const issuerId = process.env["APPLE_IAP_ISSUER_ID"];
  const keyId = process.env["APPLE_IAP_KEY_ID"];
  const privateKey = process.env["APPLE_IAP_PRIVATE_KEY"];
  const bundleId = process.env["APPLE_IAP_BUNDLE_ID"];
  if (!issuerId || !keyId || !privateKey || !bundleId) {
    throw new AppleVerificationError(
      "not-configured",
      "Apple In-App Purchase credentials are not configured.",
    );
  }
  return { issuerId, keyId, privateKey: privateKey.replace(/\\n/g, "\n"), bundleId };
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
  revocationDate?: number;
}

function decodeJwsPayload(jws: string): SignedTransactionPayload {
  const part = jws.split(".")[1];
  if (!part) throw new AppleVerificationError("apple-error", "Malformed signed transaction.");
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

/**
 * Verifies one transaction id against Apple. Production is checked first, then
 * sandbox, so TestFlight and App Review purchases work without configuration.
 */
export async function verifyAppleTransaction(
  transactionId: string,
  expectedProductId: string,
): Promise<VerifiedTransaction> {
  const config = readConfig();
  const token = createAppleJwt(config);

  let result = await fetchTransaction(PRODUCTION_BASE, transactionId, token);
  if (result.status === 404) {
    result = await fetchTransaction(SANDBOX_BASE, transactionId, token);
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
  if (payload.productId !== expectedProductId) {
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
    environment: payload.environment === "Sandbox" ? "Sandbox" : "Production",
    purchasedAt: new Date(payload.purchaseDate ?? Date.now()).toISOString(),
  };
}
