/**
 * Fire-and-forget anonymous usage statistics. Never throws, never blocks UI.
 */
import i18n from "@/i18n";
import { NATIVE_BACKEND_URL } from "@/config/native-backend";
import { getPlatform } from "@/services/native-service";
import { usePurchaseStore } from "@/state/purchase-store";
import { useWizardStore } from "@/state/wizard-store";

type StatEvent = "app_open" | "wizard_start" | "step_view" | "calculate";

export function trackEvent(event: StatEvent, step?: number): void {
  if (typeof window === "undefined") return;
  try {
    const platform = getPlatform();
    const base = platform === "web" ? "" : NATIVE_BACKEND_URL;
    const country = useWizardStore.getState().location?.countryCode?.toUpperCase();
    const body = {
      deviceId: usePurchaseStore.getState().ensureDeviceId(),
      event,
      step,
      country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
      platform,
      language: i18n.language?.slice(0, 20),
    };
    void fetch(`${base}/api/public/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // statistics must never affect the app
  }
}
