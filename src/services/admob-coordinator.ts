import type { NativeConsent } from "./admob-native";
import { recordAdDiagnostic as log } from "./ad-diagnostics";
import { tracePrivacyStep as trace } from "./ad-privacy-diagnostics";
import { AdLaunchTelemetry, type AdLaunchEvent } from "@/lib/ad-launch-events";

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
  requestTracking?(): Promise<void>;
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
  /** Bumped only by explicit privacy actions, never by ordinary interaction. */
  private privacyRevision = 0;
  private revision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private update: Promise<NativeConsent> | null = null;
  private privacy: Promise<void> | null = null;
  private mutations: Promise<unknown> = Promise.resolve();
  private cleanup: (() => void) | undefined;
  private readonly telemetry: AdLaunchTelemetry;
  constructor(private readonly ad: AdAdapter, sendTelemetry?: (event: AdLaunchEvent) => void) {
    this.telemetry = new AdLaunchTelemetry(sendTelemetry);
  }
  private log(stage: string, reason?: string, code?: number): void {
    log(stage, reason, code);
    this.telemetry.record(stage, reason);
  }

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

  private async updatePrivacyConsent(): Promise<NativeConsent> {
    // Explicit settings actions may recover UMP after launch cancellation, but
    // must never prompt Premium users or treat uncertain entitlement as free.
    if (await this.ad.premium() !== false) throw new Error("privacy_entitlement_unavailable");
    try { return await this.ad.consentUpdate(); }
    catch (error) {
      const saved = await this.ad.consentSnapshot();
      if (saved.status === "UNKNOWN" || saved.privacyOptionsRequirementStatus === "UNKNOWN") throw error;
      return saved;
    }
  }

  readPrivacy(refresh = false): Promise<{ consent: NativeConsent; tracking: string; updateFailed?: boolean }> {
    if (refresh) this.cancel("privacy_refresh");
    return trace("settings_read", () => this.serial(async () => {
      await trace("queue", async () => undefined);
      let updateFailed = false;
      let updateRejected = false;
      let updateError: unknown;
      if (refresh) {
        let canUpdate = false;
        try {
          await trace("entitlement", async () => {
            if (await this.ad.premium() !== false) throw new Error("privacy_entitlement_unavailable");
          });
          canUpdate = true;
        } catch {
          // Entitlement protects UMP mutations, not read-only native values.
          // cancel() has already disabled ads; never interpret this as free.
          updateFailed = true;
        }
        if (canUpdate) {
          try { await trace("ump_update", () => this.ad.consentUpdate()); }
          catch (error) { updateFailed = true; updateRejected = true; updateError = error; }
        }
      }
      // Update responses do not contain persisted purpose choices. Always read
      // the current native snapshot after the update has actually completed.
      const consent = await trace("native_snapshot", () => this.ad.consentSnapshot());
      if (updateRejected && (consent.status === "UNKNOWN" || consent.privacyOptionsRequirementStatus === "UNKNOWN")) throw updateError;
      return { consent, tracking: await trace("tracking_status", () => this.ad.tracking()), ...(refresh ? { updateFailed } : {}) };
    }));
  }

  cancel(reason: string): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.revision++;
    this.log("cancelled", reason);
    void this.mutate(async () => { await this.ad.setEligible(false); await this.ad.invalidate(); }).catch(() => log("native_error", "cancel"));
  }

  changePrivacy(): Promise<void> {
    if (this.privacy) return this.privacy;
    this.privacyRevision++;
    this.cancel("privacy_changed");
    this.privacy = this.serial(async () => {
      await this.mutate(async () => { await this.ad.setEligible(false); await this.ad.invalidate(); });
      try {
        if (await this.ad.premium() !== false) throw new Error("privacy_entitlement_unavailable");
        let consent = await this.ad.consentSnapshot();
        if (consent.status === "UNKNOWN" || consent.privacyOptionsRequirementStatus === "UNKNOWN") {
          consent = await this.updatePrivacyConsent();
        }
        if (consent.status === "REQUIRED" && consent.isConsentFormAvailable) await this.ad.consentForm();
        else if (consent.privacyOptionsRequirementStatus === "REQUIRED") await this.ad.privacyForm();
        else throw new Error("privacy_options_unavailable");
        log("privacy_updated");
      }
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
    this.telemetry.start();
    const revision = this.revision;
    const privacyRevision = this.privacyRevision;
    let operation = "premium";
    try {
      const premium = await bounded(this.ad.premium(), OPERATION_TIMEOUT_MS, "premium");
      this.log("premium", premium === null ? "unknown" : premium ? "active" : "inactive");
      if (premium !== false) return;
      operation = "consent";
      // UMP reports UNKNOWN until its UI-free info update has run in this
      // session. Run it for confirmed free users even after early interaction,
      // so saved choices are readable; forms, ATT and ads still require allowed().
      let consent = await this.refreshConsent();
      // Google's required consent form is shown once per launch for confirmed
      // free users even if the user already tapped or resumed the wizard; only
      // the app-open ad (and ATT) is cancelled by interaction.
      if (consent.status === "REQUIRED" && consent.isConsentFormAvailable && privacyRevision === this.privacyRevision && !this.privacy) {
        if (await bounded(this.ad.premium(), OPERATION_TIMEOUT_MS, "premium") !== false) { this.log("skipped", "premium_changed_or_unknown"); return; }
        if (privacyRevision !== this.privacyRevision || this.privacy) return;
        consent = await this.serial(async () => {
          try { return await this.ad.consentForm(); }
          catch { return this.ad.consentSnapshot(); }
        });
        if (this.ad.waitForeground) await bounded(this.ad.waitForeground(), OPERATION_TIMEOUT_MS, "foreground");
      }
      if (!this.allowed(revision)) return;
      this.cleanup = await this.ad.listen((stage, code) => this.log(stage, stage === "failed_load" && code === 3 ? "no_fill" : undefined, code));
      if (this.ad.waitForeground && !this.cancelled) await bounded(this.ad.waitForeground(), OPERATION_TIMEOUT_MS, "foreground");
      if (!consent.canRequestAds) { this.log("skipped", "consent_missing"); return; }
      if (!this.allowed(revision)) return;
      // UMP must finish first. ATT is a separate, guarded native system prompt;
      // denial never substitutes for UMP's current ad eligibility.
      try {
        await this.serial(async () => {
          const status = await this.ad.tracking();
          if (status === "notDetermined" && this.allowed(revision) && this.ad.requestTracking) {
            if (await this.ad.premium() !== false || !this.allowed(revision)) return;
            await this.ad.requestTracking();
          }
          log("tracking", status);
        });
        if (this.ad.waitForeground && !this.cancelled) await bounded(this.ad.waitForeground(), OPERATION_TIMEOUT_MS, "foreground");
      }
      catch { this.log("tracking", "unknown"); return; }
      if (!this.allowed(revision)) return;
      operation = "premium";
      if (await bounded(this.ad.premium(), OPERATION_TIMEOUT_MS, "premium") !== false) { this.log("skipped", "premium_changed_or_unknown"); return; }
      operation = "initialize";
      await this.serial(async () => { if (this.allowed(revision)) await this.ad.initialize(); });
      if (!this.allowed(revision)) return;
      // Consent/ATT time does not consume the bounded ad load/show budget.
      const deadline = Date.now() + AD_LOAD_WINDOW_MS;
      await this.mutate(async () => {
        await this.ad.invalidate();
        if (this.allowed(revision)) await this.ad.setEligible(true);
      });
      if (!this.allowed(revision)) return;
      const beforeLoad = await this.serial(() => this.ad.consentSnapshot());
      if (!beforeLoad.canRequestAds || !this.allowed(revision)) {
        if (!beforeLoad.canRequestAds) this.log("skipped", "consent_changed");
        return;
      }
      log("request");
      operation = "load";
      await bounded(this.ad.load(), AD_LOAD_WINDOW_MS, "load");
      if (!this.allowed(revision)) return;
      operation = "pre_show";
      const [current, premiumNow, state] = await bounded(Promise.all([
        this.serial(() => this.ad.consentSnapshot()), this.ad.premium(), this.ad.state(),
      ]), Math.max(1, deadline - Date.now()), "pre_show");
      const age = state.loadedAt === null ? Infinity : Date.now() - state.loadedAt;
      if (!this.allowed(revision) || Date.now() >= deadline || premiumNow !== false || !current.canRequestAds || !state.foreground || age < 0 || age >= AD_MAX_AGE_MS) {
        this.log("skipped", premiumNow !== false ? "premium_changed_or_unknown" : !current.canRequestAds ? "consent_changed" : !state.foreground ? "background" : age >= AD_MAX_AGE_MS ? "expired" : "launch_left");
        return;
      }
      this.log("show_attempt");
      operation = "show";
      await this.ad.show(); // resolves at dismissal; not a five-second operation
    } catch (error) {
      const reason = error instanceof Error && error.message.startsWith("timeout:") ? error.message : "operation_failed";
      this.log("error", reason.startsWith("timeout:") ? reason : `${operation}_failed`);
    } finally {
      this.telemetry.finish();
      this.cancel("attempt_finished");
      // A native generation token also rejects callbacks after JS timeouts.
      await this.mutate(() => this.ad.invalidate()).catch(() => log("native_error", "invalidate"));
      this.cleanup?.();
    }
  }
}