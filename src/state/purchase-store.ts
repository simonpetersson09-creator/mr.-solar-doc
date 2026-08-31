/**
 * Local bookkeeping for purchases. Never decides access on its own — the server
 * row is the source of truth. This only remembers which calculation the device
 * is working on and the tokens needed to ask the server about them.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface PendingCalculationRef {
  id: string;
  accessToken: string;
}

interface PurchaseState {
  deviceId: string | null;
  /** The calculation the paywall is currently shown for. */
  pending: PendingCalculationRef | null;
  /** Access tokens for calculations bought on this device. */
  tokens: Record<string, string>;
  /** The calculation the result page should show. */
  active: PendingCalculationRef | null;
  ensureDeviceId: () => string;
  setPending: (ref: PendingCalculationRef | null) => void;
  setActive: (ref: PendingCalculationRef | null) => void;
  rememberToken: (ref: PendingCalculationRef) => void;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export const usePurchaseStore = create<PurchaseState>()(
  persist(
    (set, get) => ({
      deviceId: null,
      pending: null,
      tokens: {},
      active: null,
      ensureDeviceId: () => {
        const existing = get().deviceId;
        if (existing) return existing;
        const created = randomId();
        set({ deviceId: created });
        return created;
      },
      setPending: (pending) => set({ pending }),
      setActive: (active) => set({ active }),
      rememberToken: (ref) =>
        set((state) => ({
          tokens: { ...state.tokens, [ref.id]: ref.accessToken },
          active: ref,
        })),
    }),
    {
      name: "mr-solar-doc-purchases",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
