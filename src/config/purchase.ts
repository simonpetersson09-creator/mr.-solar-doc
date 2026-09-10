/** Single source of truth for the App Store products. */

/** Consumable: unlocks exactly one calculation. */
export const UNLOCK_PRODUCT_ID = "com.mrsolardoc.calculation.unlock";

/**
 * Auto-renewable yearly subscription: unlimited calculations and reports.
 * MUST match the product id in App Store Connect exactly, otherwise StoreKit
 * never delivers the product and the buy button fails with an error.
 */
export const PREMIUM_PRODUCT_ID = "premium.yearly";

/**
 * Product ids accepted when verifying a subscription transaction with Apple.
 * Includes the earlier id so a transaction made with an older build is still
 * honoured instead of being rejected as "wrong product".
 */
export const PREMIUM_PRODUCT_IDS = [
  PREMIUM_PRODUCT_ID,
  "com.mrsolardoc.premium.yearly",
] as const;

/** True for any product id that grants the Premium subscription. */
export function isPremiumProductId(productId: string | null | undefined): boolean {
  return productId !== null && productId !== undefined
    ? (PREMIUM_PRODUCT_IDS as readonly string[]).includes(productId)
    : false;
}

/**
 * There are no hardcoded fallback prices. The App Store (StoreKit) price is
 * the only price ever displayed, and it is already localised for the user's
 * storefront. When StoreKit has not delivered a price yet, the UI shows a
 * neutral "fetching price" text instead of a fabricated amount or currency.
 */
export const PRICE_UNAVAILABLE = null;

/**
 * A one-off purchase may be recalculated a few times, so a typo or a changed
 * assumption does not force a new purchase. The window starts at the purchase
 * and the server is the only place the counter is kept.
 */
export const REVISION_LIMIT = 3;
export const REVISION_WINDOW_HOURS = 24;
