/**
 * Single typed interface for native capabilities.
 * UI -> Native Service -> Capacitor/Native (with web fallback).
 * Capacitor plugins are loaded lazily so the web build stays clean.
 */

export type HapticStyle = "light" | "medium" | "success" | "warning" | "error";

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function getCapacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}

export function isNativePlatform(): boolean {
  return getCapacitor()?.isNativePlatform?.() ?? false;
}

export function getPlatform(): "ios" | "android" | "web" {
  const platform = getCapacitor()?.getPlatform?.() ?? "web";
  if (platform === "ios" || platform === "android") return platform;
  return "web";
}

const WEB_VIBRATION_PATTERN: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 20,
  success: [10, 40, 10],
  warning: [20, 60, 20],
  error: [30, 60, 30, 60, 30],
};

/** Central haptic feedback entry point. */
export async function haptic(style: HapticStyle = "light"): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (isNativePlatform()) {
      const plugins = (window as unknown as {
        Capacitor?: { Plugins?: Record<string, { impact?: (o: unknown) => Promise<void>; notification?: (o: unknown) => Promise<void> }> };
      }).Capacitor?.Plugins;
      const haptics = plugins?.["Haptics"];
      if (haptics) {
        if (style === "light" || style === "medium") {
          await haptics.impact?.({ style: style === "light" ? "LIGHT" : "MEDIUM" });
        } else {
          await haptics.notification?.({ type: style.toUpperCase() });
        }
        return;
      }
    }
    navigator.vibrate?.(WEB_VIBRATION_PATTERN[style]);
  } catch {
    // Haptics are never critical.
  }
}

export interface ShareFileRequest {
  fileName: string;
  mimeType: string;
  blob: Blob;
  title?: string;
}

/** Share a generated file via the native share sheet, with browser download fallback. */
export async function shareFile(request: ShareFileRequest): Promise<"shared" | "downloaded"> {
  if (typeof window === "undefined") return "downloaded";

  const file = new File([request.blob], request.fileName, { type: request.mimeType });
  const navigatorWithShare = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };

  if (navigatorWithShare.canShare?.({ files: [file] }) && navigatorWithShare.share) {
    try {
      await navigatorWithShare.share({ files: [file], ...(request.title ? { title: request.title } : {}) });
      return "shared";
    } catch {
      // Fall through to download.
    }
  }

  const url = URL.createObjectURL(request.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = request.fileName;
  // Opening in a new context keeps the file reachable when the app runs inside
  // an iframe (Lovable preview) or a webview where inline downloads are blocked.
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Some engines (iOS WKWebView, Safari) abort the transfer if the object URL is
  // revoked immediately, so keep it alive for a while.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
