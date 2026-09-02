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
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0B1220",
      showSpinner: false,
    },
  },
};

export default config;
