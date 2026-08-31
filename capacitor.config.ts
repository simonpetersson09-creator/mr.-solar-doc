import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Mr. Solar Doc – Capacitor configuration.
 *
 * The app is a TanStack Start app with server functions (PVGIS + geocoding),
 * so it cannot be shipped as a purely static bundle. The native shell therefore
 * loads the deployed web app over https and keeps the native chrome
 * (status bar, splash screen) under our control.
 *
 * Set CAP_SERVER_URL when building for production/TestFlight, e.g.
 *   CAP_SERVER_URL=https://mrsolardoc.lovable.app npx cap sync
 *
 * The default points at the stable published URL, never the preview build, so
 * a TestFlight build can never accidentally ship against preview.
 */
const serverUrl =
  process.env["CAP_SERVER_URL"] ??
  "https://project--68a192c2-c6ae-462b-8fcb-cc89c8e860cc.lovable.app";


const config: CapacitorConfig = {
  appId: "se.shiningdays.mrsolardoc",
  appName: "Mr. Solar Doc",
  webDir: "capacitor-shell",
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
  },
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
