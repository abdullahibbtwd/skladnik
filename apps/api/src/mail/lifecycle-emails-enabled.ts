import type { ConfigService } from '@nestjs/config';

/**
 * Gate for first-scan nudge + trial lifecycle crons.
 * On by default (BG copy approved). Set LIFECYCLE_EMAILS_ENABLED=false to pause.
 *
 * Classification (engineering / owner call — not a substitute for counsel):
 * - Welcome, trial ending/ended, paid expiry reminders: transactional account mail
 *   (no marketing consent / no unsubscribe).
 * - First-scan nudge: marketing tip; respects User.marketingOptOutAt + one-click unsub.
 */
export function isLifecycleEmailsEnabled(config: ConfigService): boolean {
  const raw = config.get<string>('LIFECYCLE_EMAILS_ENABLED')?.trim().toLowerCase();
  if (raw === undefined || raw === '') return true;
  return !(raw === '0' || raw === 'false' || raw === 'no' || raw === 'off');
}
