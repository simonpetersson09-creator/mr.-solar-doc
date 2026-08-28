import { useEffect } from "react";

/**
 * Initialises native chrome when the app runs inside the Capacitor shell.
 * No-op in the browser: the plugins are imported lazily so the web bundle
 * never pays for them.
 */
export function useNativeShell() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (cancelled || !Capacitor.isNativePlatform()) return;

      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
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
