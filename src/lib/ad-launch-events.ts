/** Fixed event names only; no consent values, raw errors or advertising IDs. */
export const AD_SKIP_REASONS = [
  "interaction", "navigation", "wizard_resumed", "background", "privacy_action",
  "premium", "premium_unknown", "consent_unavailable", "timeout", "no_fill",
  "load_error", "show_error", "native_error", "tracking_error", "expired", "launch_left",
] as const;
export type AdSkipReason = typeof AD_SKIP_REASONS[number];
export type AdLaunchEvent = "ad_open_started" | "ad_open_shown" | "ad_open_impression" |
  "ad_open_unconfirmed" | `ad_open_skipped_${AdSkipReason}`;
export const AD_LAUNCH_EVENTS: readonly AdLaunchEvent[] = [
  "ad_open_started", "ad_open_shown", "ad_open_impression", "ad_open_unconfirmed",
  ...AD_SKIP_REASONS.map((reason): AdLaunchEvent => `ad_open_skipped_${reason}`),
];

/** Observes an existing launch. It never authorizes, delays or retries an ad. */
export class AdLaunchTelemetry {
  private started = false;
  private finished = false;
  private shown = false;
  private impression = false;
  private showAttempted = false;
  private reason: AdSkipReason | undefined;
  constructor(private readonly send?: (event: AdLaunchEvent) => void) {}
  private emit(event: AdLaunchEvent): void {
    try { this.send?.(event); } catch { /* Telemetry cannot affect native flow. */ }
  }
  start(): void {
    if (this.started) return;
    this.started = true;
    this.emit("ad_open_started");
  }
  record(stage: string, reason?: string): void {
    if (this.finished) return;
    if (stage === "opened" && !this.shown) {
      this.shown = true; this.emit("ad_open_shown");
    }
    if (stage === "impression" && !this.impression) {
      this.impression = true; this.emit("ad_open_impression");
    }
    if (stage === "show_attempt") this.showAttempted = true;
    if (stage === "premium" && reason !== "inactive") this.reason = reason === "active" ? "premium" : "premium_unknown";
    if (stage === "cancelled" && reason !== "attempt_finished" && !this.reason) {
      this.reason = reason === "navigation" ? "navigation" : reason === "wizard_resumed" ? "wizard_resumed"
        : reason?.startsWith("background") ? "background" : reason?.startsWith("privacy_") ? "privacy_action" : "interaction";
    }
    if (stage === "skipped") this.reason = reason?.startsWith("premium_") ? "premium_unknown"
      : reason?.startsWith("consent_") ? "consent_unavailable" : reason === "background" ? "background"
        : reason === "expired" ? "expired" : "launch_left";
    if (stage === "failed_load") this.reason = reason === "no_fill" ? "no_fill" : "load_error";
    if (stage === "failed_show") this.reason = "show_error";
    if (stage === "tracking" && reason === "unknown") this.reason = "tracking_error";
    if (stage === "error" && !this.reason) this.reason = reason?.startsWith("timeout:") ? "timeout"
      : reason === "premium_failed" ? "premium_unknown" : reason === "load_failed" ? "load_error"
        : reason === "show_failed" ? "show_error" : reason === "consent_failed" ? "consent_unavailable" : "native_error";
  }
  finish(): void {
    if (!this.started || this.finished) return;
    this.finished = true;
    // An attempted show is not a confirmed open, and cannot be called skipped.
    if (this.shown || this.impression) return;
    if (this.showAttempted && this.reason !== "show_error") this.emit("ad_open_unconfirmed");
    else this.emit(`ad_open_skipped_${this.reason ?? "launch_left"}`);
  }
}