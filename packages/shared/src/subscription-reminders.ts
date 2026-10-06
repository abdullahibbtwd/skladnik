/** Pure helpers for subscription expiry reminders and UI banners. */

export const EXPIRY_REMINDER_DAYS = [30, 14, 7, 1] as const;
export type ExpiryReminderDays = (typeof EXPIRY_REMINDER_DAYS)[number];

/** Show the expiring-soon banner when expiry is within this many days (inclusive). */
export const EXPIRING_SOON_BANNER_DAYS = 30;

/** Failed activation attempts on one code before a platform alert is recorded. */
export const ACTIVATION_FAILED_ALERT_THRESHOLD = 5;

export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function utcDayEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/** Whole calendar days from `now` until `expiresAt` (UTC date). Negative if already past. */
export function daysUntilExpiry(expiresAt: Date | string, now: Date = new Date()): number {
  const end = utcDayStart(expiresAt instanceof Date ? expiresAt : new Date(expiresAt));
  const start = utcDayStart(now);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

/** Whether the UI should show the expiring-soon banner for a writable subscription. */
export function isExpiringSoon(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  const days = daysUntilExpiry(expiresAt, now);
  return days >= 0 && days <= EXPIRING_SOON_BANNER_DAYS;
}

/** Reminder bucket that fires today for this expiry, if any. */
export function reminderDaysForExpiry(
  expiresAt: Date | string,
  now: Date = new Date(),
): ExpiryReminderDays | null {
  const days = daysUntilExpiry(expiresAt, now);
  return (EXPIRY_REMINDER_DAYS as readonly number[]).includes(days)
    ? (days as ExpiryReminderDays)
    : null;
}

export function reminderEventPayload(daysBefore: ExpiryReminderDays, expiresAt: Date) {
  return {
    kind: 'expiry_reminder' as const,
    daysBefore,
    forExpiresAt: expiresAt.toISOString(),
  };
}
