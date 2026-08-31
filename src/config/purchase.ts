/** Single source of truth for the App Store products. */

/** Consumable: unlocks exactly one calculation. */
export const UNLOCK_PRODUCT_ID = "com.mrsolardoc.calculation.unlock";

/** Auto-renewable yearly subscription: unlimited calculations and reports. */
export const PREMIUM_PRODUCT_ID = "com.mrsolardoc.premium.yearly";

/**
 * There are no hardcoded fallback prices. The App Store (StoreKit) price is
 * the only price ever displayed, and it is already localised for the user's
 * storefront. When StoreKit has not delivered a price yet, the UI shows a
 * neutral "fetching price" text instead of a fabricated amount or currency.
 */
export const PRICE_UNAVAILABLE = null;
