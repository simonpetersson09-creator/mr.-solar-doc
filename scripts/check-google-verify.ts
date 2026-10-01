/**
 * One-off diagnostic: mints an OAuth token from the service-account secret and
 * calls the Android Publisher API with a dummy token, printing the HTTP status
 * and Google's error message (never any secret material).
 */
import { createSign } from "node:crypto";

const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME;

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

async function main() {
  if (!SERVICE_ACCOUNT_JSON || !PACKAGE_NAME) {
    console.log("missing env: secret or package name");
    return;
  }
  const serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON) as {
    client_email: string;
    private_key: string;
  };
  const now = Math.floor(Date.now() / 1000);
  const assertion = [
    base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64Url(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  ].join(".");
  const signed = `${assertion}.${base64Url(
    createSign("RSA-SHA256").update(assertion).sign(serviceAccount.private_key),
  )}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signed }),
  });
  console.log(`oauth token: ${tokenResponse.status}`);
  if (!tokenResponse.ok) {
    console.log(`oauth error body: ${(await tokenResponse.text()).slice(0, 300)}`);
    return;
  }
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/com.mrsolardoc.calculation.unlock/tokens/dummy-token-runtime-check`;
  const apiResponse = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  console.log(`androidpublisher: ${apiResponse.status}`);
  const text = await apiResponse.text();
  console.log(`androidpublisher body: ${text.slice(0, 500)}`);
}

main();
