/**
 * Development-only paywall bypass.
 *
 * In local development (`vite dev`) the paywall is unlocked so the result page
 * and PDF export can be exercised without going through Apple IAP. This flag
 * is tree-shaken to `false` in production builds, so it can never ship.
 */
export function isDevUnlock(): boolean {
  return import.meta.env.DEV;
}
