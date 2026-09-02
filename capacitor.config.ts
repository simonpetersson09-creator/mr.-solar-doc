import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Mr. Solar Doc – Capacitor configuration.
 *
 * The whole frontend ships inside the app bundle (built by
 * `npm run build:native` into `capacitor-www`), so the app opens instantly and
 * without a network round-trip for the UI. Backend work (PVGIS, geocoding,
 * purchase verification) still goes to the deployed https backend through
 * server-function calls — see src/config/native-backend.ts.
 *
 * There is deliberately no `server.url`: App Store review treats a remote-URL
 * shell as a website wrapper.
 */
const config: CapacitorConfig = {
  appId: "se.shiningdays.mrsolardoc",
  appName: "Mr. Solar Doc",
  webDir: "capacitor-www",
  // `contentInset: "always"` made WKWebView inset its content by the safe area
  // and exposed the (black) native view behind the status bar and home
  // indicator. "never" lets the web content paint edge to edge; safe areas are
  // handled in CSS via env(safe-area-inset-*).
  ios: {
    contentInset: "never",
    backgroundColor: "#FBF9F3",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#FBF9F3",
      showSpinner: false,
    },
  },
};

export default config;
