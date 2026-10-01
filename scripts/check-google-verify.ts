/**
 * One-off runtime check: proves the Google service-account secret mints an
 * OAuth token and that the Google Play Developer API is reachable and answers
 * with a real provider error for a dummy purchase token. Prints no secrets.
 */
import { getGoogleSubscriptionState, verifyGoogleProductPurchase } from "@/lib/google-play.server";

async function main() {
  // 1. One-off unlock verification with a dummy token.
  try {
    await verifyGoogleProductPurchase("dummy-token-runtime-check", [
      "com.mrsolardoc.calculation.unlock",
    ]);
    console.log("product: UNEXPECTED SUCCESS (dummy token accepted?)");
  } catch (error) {
    const name = (error as { name?: string }).name;
    const code = (error as { code?: string }).code;
    console.log(`product check: ${name} code=${code}`);
  }

  // 2. Subscription state with a dummy token.
  try {
    const state = await getGoogleSubscriptionState("dummy-token-runtime-check");
    console.log(`subscription check: unexpected success ${JSON.stringify(state)}`);
  } catch (error) {
    const name = (error as { name?: string }).name;
    const code = (error as { code?: string }).code;
    const message = (error as { message?: string }).message;
    console.log(`subscription check: ${name} code=${code} message=${message?.slice(0, 200)}`);
  }
}

main();
