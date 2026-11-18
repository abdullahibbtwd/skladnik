/**
 * Dev helper: render + send (or log) a welcome email to a given address.
 *
 * Usage:
 *   npm run mail:test-welcome --workspace=@skladnik/api -- you@example.com [en|bg]
 *
 * Requires SMTP_* in .env for a real send; otherwise the HTML/text is logged.
 */
import { ConfigService } from '@nestjs/config';
import { parseAppLocale } from '@skladnik/shared';
import { MailService } from './mail.service';

async function main() {
  const to = process.argv[2]?.trim();
  const locale = parseAppLocale(process.argv[3] ?? 'en');
  if (!to || !to.includes('@')) {
    console.error('Usage: npm run mail:test-welcome --workspace=@skladnik/api -- you@example.com [en|bg]');
    process.exit(1);
  }

  const config = new ConfigService();
  const mail = new MailService(config);
  const origin = (config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5176').replace(/\/$/, '');
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const result = await mail.sendWelcomeEmail({
    to,
    name: 'Test Owner',
    companyName: 'Demo Store',
    locale,
    trialEndsAt,
    scanUrl: `${origin}/app`,
    helpUrl: `${origin}/app/help`,
  });

  if (result.delivered) {
    console.log(`Sent welcome email (${locale}) to ${to}`);
  } else if (result.skippedNoSmtp) {
    console.log(`SMTP not configured — welcome email for ${to} (${locale}) was logged only.`);
  } else {
    console.log(`Welcome email not delivered to ${to}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
