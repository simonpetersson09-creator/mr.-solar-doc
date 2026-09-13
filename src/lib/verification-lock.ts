/** Synchronous guard shared by manual and scheduled verification retries. */
export function createVerificationLock() {
  let running = false;
  return {
    acquire() {
      if (running) return false;
      running = true;
      return true;
    },
    release() { running = false; },
  };
}