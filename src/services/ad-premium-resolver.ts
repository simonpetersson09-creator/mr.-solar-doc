export const PREMIUM_RETRY_DELAY_MS = 1000;
export const PREMIUM_RETRY_COOLDOWN_MS = 5000;
export const PREMIUM_WAIT_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 2;

export interface AdPremiumDependencies {
  initialize(): Promise<void>;
  initialized(): boolean;
  drain(): Promise<unknown>;
  cachedActive(): boolean;
  fetchStatus(): Promise<{ active: boolean; stale?: boolean }>;
}

/** One resolver per app lifetime; only successful readiness is retained. */
export function createAdPremiumResolver(deps: AdPremiumDependencies): () => Promise<boolean | null> {
  let ready = false;
  let inFlight: Promise<boolean | null> | undefined;
  let retryAfter = 0;

  async function attempt(): Promise<boolean | null> {
    try {
      if (!ready) {
        await deps.initialize();
        if (!deps.initialized()) return null;
        await deps.drain();
        ready = true;
      }
      if (deps.cachedActive()) return true;
      const status = await deps.fetchStatus();
      // Only an explicit, fresh inactive answer can authorize advertising.
      if (status.active === true) return true;
      return status.active === false && status.stale !== true ? false : null;
    } catch { return null; }
  }

  return () => {
    if (inFlight) return inFlight;
    if (Date.now() < retryAfter) return Promise.resolve(null);
    const operation = (async () => {
      for (let index = 0; index < MAX_ATTEMPTS; index++) {
        if (index > 0) await new Promise<void>((resolve) => setTimeout(resolve, PREMIUM_RETRY_DELAY_MS));
        const result = await attempt();
        if (result !== null) { retryAfter = 0; return result; }
      }
      retryAfter = Date.now() + PREMIUM_RETRY_COOLDOWN_MS;
      return null;
    })();
    let timer: ReturnType<typeof setTimeout>;
    inFlight = Promise.race([
      operation,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), PREMIUM_WAIT_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
    // A timeout stops waiting, not the native/network operation. Keep the
    // single-flight lock until actual settlement to prevent duplicate calls.
    void operation.finally(() => { inFlight = undefined; });
    return inFlight;
  };
}