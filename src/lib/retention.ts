/**
 * Data retention rules, mirroring the privacy policy.
 * Browser-safe: pure date math only, no database or server imports.
 */

/** Anonymous usage statistics are kept for this many months. */
export const APP_EVENTS_RETENTION_MONTHS = 24;

/** Started but never paid calculations are kept for this many months. */
export const UNPAID_CALCULATION_RETENTION_MONTHS = 12;

/**
 * Calculation rows that may be removed once their retention period has passed.
 * Paid rows are receipts and are never targeted here.
 */
export const REMOVABLE_CALCULATION_STATUSES = ["pending", "failed", "cancelled"] as const;

export function subtractMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  next.setUTCMonth(next.getUTCMonth() - months);
  return next;
}

/** ISO timestamps: rows older than these are deleted by the retention job. */
export function retentionCutoffs(now: Date = new Date()): {
  appEventsBefore: string;
  unpaidCalculationsBefore: string;
} {
  return {
    appEventsBefore: subtractMonths(now, APP_EVENTS_RETENTION_MONTHS).toISOString(),
    unpaidCalculationsBefore: subtractMonths(
      now,
      UNPAID_CALCULATION_RETENTION_MONTHS,
    ).toISOString(),
  };
}
