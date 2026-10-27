import type { NativeConsent } from "./admob-native";
import { recordAdDiagnostic as log } from "./ad-diagnostics";

export const AD_MAX_AGE_MS = 4 * 60 * 60 * 1000;
export const AD_LOAD_WINDOW_MS = 5000;
const OPERATION_TIMEOUT_MS = 15000;

export interface AdAdapter {
  premium(): Promise<boolean | null>;
  consentUpdate(): Promise<NativeConsent>;
  consentSnapshot(): Promise<NativeConsent>;
  consentForm(): Promise<NativeConsent>;
  privacyForm(): Promise<void>;
  tracking(): Promise<string>;
  waitForeground?(): Promise<void>;
  initialize(): Promise<void>;
  load(): Promise<void>;
  show(): Promise<void>;
  invalidate(): Promise<void>;
  setEligible(eligible: boolean): Promise<void>;
  state(): Promise<{ loadedAt: number | null; foreground: boolean }>;
  eligible(): boolean;
  listen(onEvent: (stage: string, code?: number) => void): Promise<() => void>;
}

function bounded<T>(promise: Promise<T>, ms: number, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout:${stage}`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** One instance per JS lifetime; cancellation never grants a second start. */
export class AdMobCoordinator {
  private started = false;
  private cancelled = false;
  private revision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private update: Promise<NativeConsent> | null = null;
  private privacy: Promise<void> | null = null;
  private mutations: Promise<unknown> = Promise.resolve();
  private cleanup: (() => void) | undefined;
  constructor(private readonly ad: AdAdapter) {}

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    // Keep the queue occupied until the actual native call settles, even if a
    // caller's bounded wait has timed out; never overlap native consent calls.
    this.queue = result.catch(() => undefined);
    return bounded(result, OPERATION_TIMEOUT_MS, "consent");
  }

  private mutate(operation: () => Promise<void>): Promise<void> {
    const result = this.mutations.then(operation);
    this.mutations = result.catch(() => undefined);
    return bounded(result, OPERATION_TIMEOUT_MS, "native_mutation");
  }

  refreshConsent(): Promise<NativeConsent> {
    if (this.update) return this.update;
    this.update = this.serial(async () => {
      log("consent_update");
      try { return await this.ad.consentUpdate(); }
      catch {
        // Only the current native SDK can authorize the previous-session path.
        const snapshot = await this.ad.consentSnapshot();
        log("consent_update_error", snapshot.canRequestAds ? "native_saved_consent" : "not_allowed");
        return snapshot;
      }
    }).finally(() => { this.update = null; });
    return this.update;
  }

  cancel(reason: string): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.revision++;
    log("cancelled", reason);
    void this.mutate(async () => { await this.ad.setEligible(false); await this.ad.invalidate(); }).catch(() => log("native_error", "cancel"));
  }

  changePrivacy(): Promise<void> {
    if (this.privacy) return this.privacy;
    this.cancel("privacy_changed");
    this.privacy = this.serial(async () => {
      await this.mutate(async () => { await this.ad.setEligible(false); await this.ad.invalidate(); });
      try { await this.ad.privacyForm(); log("privacy_updated"); }
      finally { await this.mutate(() => this.ad.invalidate()); }
    }).finally(() => { this.privacy = null; });
    return this.privacy;
  }

  private allowed(revision: number): boolean {
    return !this.cancelled && revision === this.revision && this.ad.eligible();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const revision = this.revision;
    try {
      const premium = await bounded(this.ad.premium(), OPERATION_TIMEOUT_MS, "premium");
      log("premium", premium === null ? "unknown" : premium ? "active" : "inactive");
      if (premium !== false || !this.allowed(revision)) return;
      this.cleanup = await this.ad.listen((stage, code) => log(stage, stage === "failed_load" && code === 3 ? "no_fill" : undefined, code));
      let consent = await this.refreshConsent();
      if (consent.status === "REQUIRED" && consent.isConsentFormAvailable) {
        if (!this.allowed(revision)) return;
        consent = await this.serial(async () => {
          try { return await this.ad.consentForm(); }
          catch { return this.ad.consentSnapshot(); }
        });
        if (this.ad.waitForeground) await bounded(this.ad.waitForeground(), OPERATION_TIMEOUT_MS, "foreground");
      }
      if (this.ad.waitForeground && !this.cancelled) await bounded(this.ad.waitForeground(), OPERATION_TIMEOUT_MS, "foreground");
      if (!consent.canRequestAds) { log("skipped", "consent_missing"); return; }
      if (!this.allowed(revision)) return;
      // UMP owns any configured IDFA explainer/ATT prompt. Reading ATT never
      // prompts or equates ATT denial with GDPR personalization refusal.
      try { log("tracking", await bounded(this.ad.tracking(), OPERATION_TIMEOUT_MS, "tracking")); }
      catch { log("tracking", "unknown"); }
      if (!this.allowed(revision)) return;
      if (await bounded(this.ad.premium(), OPERATION_TIMEOUT_MS, "premium") !== false) { log("skipped", "premium_changed_or_unknown"); return; }
      await bounded(this.ad.initialize(), OPERATION_TIMEOUT_MS, "initialize");
      if (!this.allowed(revision)) return;
      // Consent/ATT time does not consume the bounded ad load/show budget.
      const deadline = Date.now() + AD_LOAD_WINDOW_MS;
      await this.mutate(async () => {
        await this.ad.invalidate();
        if (this.allowed(revision)) await this.ad.setEligible(true);
      });
      if (!this.allowed(revision)) return;
      log("request");
      await bounded(this.ad.load(), AD_LOAD_WINDOW_MS, "load");
      if (!this.allowed(revision)) return;
      const [current, premiumNow, state] = await bounded(Promise.all([
        this.serial(() => this.ad.consentSnapshot()), this.ad.premium(), this.ad.state(),
      ]), Math.max(1, deadline - Date.now()), "pre_show");
      const age = state.loadedAt === null ? Infinity : Date.now() - state.loadedAt;
      if (!this.allowed(revision) || Date.now() >= deadline || premiumNow !== false || !current.canRequestAds || !state.foreground || age < 0 || age >= AD_MAX_AGE_MS) {
        log("skipped", premiumNow !== false ? "premium_changed_or_unknown" : !current.canRequestAds ? "consent_changed" : !state.foreground ? "background" : age >= AD_MAX_AGE_MS ? "expired" : "launch_left");
        return;
      }
      log("show_attempt");
      await this.ad.show(); // resolves at dismissal; not a five-second operation
    } catch (error) {
      const reason = error instanceof Error && error.message.startsWith("timeout:") ? error.message : "operation_failed";
      log("error", reason);
    } finally {
      this.cancel("attempt_finished");
      // A native generation token also rejects callbacks after JS timeouts.
      await this.mutate(() => this.ad.invalidate()).catch(() => log("native_error", "invalidate"));
      this.cleanup?.();
    }
  }
}