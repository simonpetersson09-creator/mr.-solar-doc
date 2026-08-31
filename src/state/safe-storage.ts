/**
 * Fail-safe persistence for zustand stores.
 *
 * Storage is hostile input: it can be unavailable (Safari private mode,
 * disabled cookies), throw on write (quota, SecurityError), or contain
 * corrupt/partial JSON written by an older build. None of that may crash the
 * app or — worse — feed a corrupt state into the calculation engine.
 *
 * Rules:
 *  - a read that is not valid JSON is treated as "no state" (fresh start)
 *  - a write that throws is swallowed and reported, never surfaced as a crash
 *  - when storage is missing entirely, an in-memory fallback keeps the session
 *    working for as long as the tab lives
 */

import type { StateStorage } from "zustand/middleware";
import { reportLovableError } from "@/lib/lovable-error-reporting";

function memoryStorage(): Storage | null {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

/** Returns localStorage when it is genuinely usable, otherwise a memory shim. */
export function resolveWebStorage(): Storage {
  try {
    if (typeof window === "undefined" || !window.localStorage) return memoryStorage()!;
    const probe = "__mrsolardoc_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Unavailable / SecurityError / quota-locked storage.
    return memoryStorage()!;
  }
}

/**
 * A `StateStorage` that never throws. Invalid JSON is dropped so zustand
 * starts from the store's own initial state instead of a half-parsed object.
 */
export function createSafeStorage(name: string): StateStorage {
  const storage = resolveWebStorage();
  return {
    getItem: (key) => {
      try {
        const raw = storage.getItem(key);
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object") throw new Error("not an object");
        return raw;
      } catch (error) {
        reportLovableError(error, { scope: "persisted-state", store: name, op: "read" });
        try {
          storage.removeItem(key);
        } catch {
          /* nothing else we can do */
        }
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        storage.setItem(key, value);
      } catch (error) {
        reportLovableError(error, { scope: "persisted-state", store: name, op: "write" });
      }
    },
    removeItem: (key) => {
      try {
        storage.removeItem(key);
      } catch (error) {
        reportLovableError(error, { scope: "persisted-state", store: name, op: "remove" });
      }
    },
  };
}
