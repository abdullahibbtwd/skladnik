import type { ConfigService } from '@nestjs/config';

/**
 * Gate for first-scan nudge + trial lifecycle crons.
 * Off by default until Bulgarian copy review is done (LIFECYCLE_EMAILS_ENABLED=true).
 */
export function isLifecycleEmailsEnabled(config: ConfigService): boolean {
  const raw = config.get<string>('LIFECYCLE_EMAILS_ENABLED')?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}
