import { useEffect, useState } from "react";
import type { PurchaseDiagnostics } from "@/services/iap-service";
import { isDevUnlock } from "@/lib/dev-unlock";

/**
 * StoreKit diagnostics for development and TestFlight troubleshooting.
 *
 * Never visible in normal production use: it renders only in a dev build, or
 * when the tester explicitly opts in with `?iapdebug=1` (remembered for the
 * session), which is how we read the real StoreKit state on a TestFlight device.
 */
export function isPurchaseDebugEnabled(): boolean {
  if (isDevUnlock()) return true;
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("iapdebug") === "1") {
      window.sessionStorage.setItem("iap-debug", "1");
    }
    return window.sessionStorage.getItem("iap-debug") === "1";
  } catch {
    return false;
  }
}

export function PurchaseDiagnosticsPanel({ diagnostics }: { diagnostics: PurchaseDiagnostics }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => setEnabled(isPurchaseDebugEnabled()), []);
  if (!enabled) return null;

  const rows: [string, string][] = [
    ["CdvPurchase", String(diagnostics.pluginPresent)],
    ["supported", String(diagnostics.supported)],
    ["initialized", String(diagnostics.initialized)],
    ["ready", String(diagnostics.ready)],
    ["products", String(diagnostics.productCount)],
    ["ids", diagnostics.productIds.join(", ") || "—"],
    [
      "last error",
      diagnostics.lastErrorMessage
        ? `${diagnostics.lastErrorCode ?? "—"}: ${diagnostics.lastErrorMessage}`
        : "—",
    ],
  ];

  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
      <p className="font-bold text-foreground">StoreKit diagnostics</p>
      {rows.map(([label, value]) => (
        <p key={label}>
          {label}: <span className="text-foreground">{value}</span>
        </p>
      ))}
    </div>
  );
}
