import { useEffect } from "react";

/**
 * Initialises native chrome when the app runs inside the Capacitor shell.
 * No-op in the browser: the plugins are imported lazily so the web bundle
 * never pays for them.
 */
export function useNativeShell() {
  useEffect(() => {
    let cancelled = false;

    // Standalone/native shells draw under the status bar (clock, battery), so we
    // flag the document and let CSS reserve a minimum top inset.
    const standalone =
      typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)").matches === true;
    if (standalone) document.documentElement.dataset["native"] = "true";

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (cancelled || !Capacitor.isNativePlatform()) return;
      document.documentElement.dataset["native"] = "true";


      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // The web content must draw *under* the status bar so the page
        // background (or the map) reaches the physical top edge instead of the
        // native black bar. Safe-area padding keeps controls clear of it.
        await StatusBar.setOverlaysWebView({ overlay: true });
        // Style.Light = dark text. The app background is cream/white, so dark
        // status-bar text (clock, battery) stays legible on notch/Dynamic Island.
        await StatusBar.setStyle({ style: Style.Light });
      } catch {
        /* status bar unavailable on this platform */
      }

      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        /* splash screen already hidden */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
