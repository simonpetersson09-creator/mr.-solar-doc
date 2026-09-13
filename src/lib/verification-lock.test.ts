import { describe, expect, it } from 'vitest';
import { createVerificationLock } from './verification-lock';

describe('purchase verification retries', () => {
  it('blocks a second retry synchronously and permits a later retry', () => {
    const lock = createVerificationLock();
    expect(lock.acquire()).toBe(true);
    expect(lock.acquire()).toBe(false);
    lock.release();
    expect(lock.acquire()).toBe(true);
  });
  it('can release after a failed verification', async () => {
    const lock = createVerificationLock();
    try {
      expect(lock.acquire()).toBe(true);
      await Promise.reject(new Error('network'));
    } catch {
      // The paywall keeps the approved transaction available for retry.
    } finally {
      lock.release();
    }
    expect(lock.acquire()).toBe(true);
  });
});