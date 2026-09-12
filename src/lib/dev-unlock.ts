/**
 * Paywall bypass for development and the private Lovable preview.
 *
 * Enabled when Vite runs in development (`import.meta.env.DEV`) or when the app
 * is served from the private Lovable preview hosts:
 *   - `id-preview--<id>.lovable.app`
 *   - `*.lovableproject.com`
 *
 * The published site (custom domain or `<name>.lovable.app` without the
 * `id-preview--` prefix) never matches, so real users always see the paywall.
 */
function isPreviewHost(hostname: string): boolean {
  if (hostname.endsWith(".lovableproject.com")) return true;
  return hostname.startsWith("id-preview--") && hostname.endsWith(".lovable.app");
}

export function isDevUnlock(): boolean {
  if (import.meta.env.DEV === true) return true;
  if (typeof location === "undefined" || typeof location.hostname !== "string") return false;
  return isPreviewHost(location.hostname);
}
