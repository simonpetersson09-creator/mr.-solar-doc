/**
 * Local-only storage of calculations. The calculation itself — address,
 * coordinates, consumption, roof data, economic assumptions and results —
 * never leaves the device: it lives here, in the browser/app storage.
 *
 * The server only holds a receipt row (see purchase.functions.ts) that says
 * whether a calculation id has been paid for.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createSafeStorage } from "@/state/safe-storage";
import type { CalculationSnapshot } from "@/lib/calculation-snapshot";

export interface StoredCalculation {
  id: string;
  accessToken: string;
  createdAt: string;
  snapshot: CalculationSnapshot;
}

interface CalculationState {
  items: Record<string, StoredCalculation>;
  save: (item: StoredCalculation) => void;
  get: (id: string | null | undefined) => StoredCalculation | null;
  remove: (id: string) => void;
  clear: () => void;
}

export const useCalculationStore = create<CalculationState>()(
  persist(
    (set, get) => ({
      items: {},
      save: (item) => set((state) => ({ items: { ...state.items, [item.id]: item } })),
      get: (id) => (id ? (get().items[id] ?? null) : null),
      remove: (id) =>
        set((state) => {
          const next = { ...state.items };
          delete next[id];
          return { items: next };
        }),
      clear: () => set({ items: {} }),
    }),
    {
      name: "mr-solar-doc-calculations",
      version: 1,
      // Storage may be unavailable or corrupt; reads/writes must never throw.
      storage: createJSONStorage(() => createSafeStorage("calculation")),
    },
  ),
);
