import { describe, expect, it } from "vitest";

import {
  APP_EVENTS_RETENTION_MONTHS,
  REMOVABLE_CALCULATION_STATUSES,
  UNPAID_CALCULATION_RETENTION_MONTHS,
  retentionCutoffs,
} from "./retention";

describe("data retention", () => {
  it("deletes anonymous statistics older than 24 months", () => {
    const cutoffs = retentionCutoffs(new Date("2026-11-10T09:00:00Z"));
    expect(APP_EVENTS_RETENTION_MONTHS).toBe(24);
    expect(cutoffs.appEventsBefore).toBe("2024-11-10T09:00:00.000Z");
  });

  it("deletes started but unpaid calculations older than 12 months", () => {
    const cutoffs = retentionCutoffs(new Date("2026-11-10T09:00:00Z"));
    expect(UNPAID_CALCULATION_RETENTION_MONTHS).toBe(12);
    expect(cutoffs.unpaidCalculationsBefore).toBe("2025-11-10T09:00:00.000Z");
  });

  it("never targets paid reports", () => {
    expect([...REMOVABLE_CALCULATION_STATUSES]).toEqual([
      "pending",
      "failed",
      "cancelled",
    ]);
    expect(REMOVABLE_CALCULATION_STATUSES).not.toContain("paid");
  });
});
