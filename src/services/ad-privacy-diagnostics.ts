import { recordAdDiagnostic } from "./ad-diagnostics";

export type PrivacyStep = "settings_read" | "queue" | "entitlement" | "ump_update" | "native_snapshot" | "tracking_status" | "native_invalidate" | "native_eligibility" | "initial_form" | "privacy_form";
export type PrivacyDiagnostic = { step: PrivacyStep; outcome: "started" | "ok" | "failed"; code?: number | string; reason?: string };
const entries: PrivacyDiagnostic[] = [];
const listeners = new Set<() => void>();
export const PRIVACY_DIAGNOSTICS_VERSION = "privacy-diag-1";

/** Never retain error messages, SDK responses, consent bits, identifiers or receipts. */
function safeError(error: unknown): Pick<PrivacyDiagnostic, "code" | "reason"> {
  const object = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const message = typeof object.message === "string" ? object.message : "";
  const raw = object.code;
  const code = typeof raw === "number" && Number.isFinite(raw) ? raw
    : typeof raw === "string" && (/^-?\d{1,10}$/.test(raw) || ["UNIMPLEMENTED", "UNAVAILABLE"].includes(raw)) ? raw : undefined;
  const reason = /not implemented|unimplemented/i.test(message) || code === "UNIMPLEMENTED" ? "not_implemented"
    : message.startsWith("timeout:") ? "timeout"
    : message === "privacy_entitlement_unavailable" ? "entitlement_unavailable"
    : message === "privacy_options_unavailable" ? "form_unavailable"
    : /no viewcontroller/i.test(message) ? "no_view_controller" : "operation_rejected";
  return { ...(code === undefined ? {} : { code }), reason };
}

function record(entry: PrivacyDiagnostic): void {
  entries.push(entry);
  if (entries.length > 40) entries.shift();
  recordAdDiagnostic(`privacy_${entry.step}_${entry.outcome}`, entry.reason, typeof entry.code === "number" ? entry.code : undefined);
  // Sanitized symbolic/numeric native codes are also available in device logs.
  console.info("[adprivacy]", entry);
  for (const listener of listeners) listener();
}

export async function tracePrivacyStep<T>(step: PrivacyStep, operation: () => Promise<T>): Promise<T> {
  record({ step, outcome: "started" });
  try {
    const result = await operation();
    record({ step, outcome: "ok" });
    return result;
  } catch (error) {
    record({ step, outcome: "failed", ...safeError(error) });
    throw error;
  }
}
export function getPrivacyDiagnostics(): readonly PrivacyDiagnostic[] { return entries.map((entry) => ({ ...entry })); }
export function subscribePrivacyDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}