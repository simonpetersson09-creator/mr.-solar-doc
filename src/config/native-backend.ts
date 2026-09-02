/**
 * Backend addressing for the native (Capacitor) build.
 *
 * The web app is served by the TanStack Start server itself, so its server
 * functions are called with same-origin relative URLs and nothing here
 * applies. The native app ships its frontend inside the app bundle and runs
 * on a local scheme (`capacitor://localhost`), so its server-function calls
 * must be sent to the deployed backend over https instead.
 *
 * The base URL is a build-time constant, never a secret: it is a public
 * https endpoint. Secrets stay on the server.
 */

/** Deployed backend used by the native app. Overridable at build time. */
export const NATIVE_BACKEND_URL: string = (
  import.meta.env["VITE_NATIVE_BACKEND_URL"] ??
  "https://ray-design-app.lovable.app"
).replace(/\/+$/, "");

/**
 * Origins a Capacitor webview can present. Kept as an explicit allowlist so
 * the backend never has to fall back to a wildcard CORS policy.
 *
 * - iOS WKWebView serves the bundle from `capacitor://localhost`
 * - Android WebView serves it from `https://localhost`
 * - `http://localhost` covers `npx cap run` with a live-reload server
 */
export const NATIVE_APP_ORIGINS: readonly string[] = [
  "capacitor://localhost",
  "ionic://localhost",
  "https://localhost",
  "http://localhost",
];

export function isNativeAppOrigin(origin: string | null | undefined): boolean {
  return origin != null && NATIVE_APP_ORIGINS.includes(origin);
}
