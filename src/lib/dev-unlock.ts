/**
 * Development-only paywall bypass.
 *
 * In local development (`vite dev`) the paywall is unlocked so the result page
 * and PDF export can be exercised without going through Apple IAP. This flag
 * is tree-shaken to `false` in production builds, so it can never ship.
 */
export function isDevUnlock(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname.includes("-preview--") ||
    hostname.includes("--preview.")
  );
}
