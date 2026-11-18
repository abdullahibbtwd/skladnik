import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { parseAppLocale } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { WELCOME_QUEUE, type WelcomeJobData } from './welcome.constants';

@Processor(WELCOME_QUEUE, { concurrency: 2 })
export class WelcomeMailProcessor extends WorkerHost {
  private readonly logger = new Logger(WelcomeMailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<WelcomeJobData>) {
    const user = await this.prisma.user.findUnique({
      where: { id: job.data.userId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            subscriptions: {
              where: { status: { in: ['TRIAL', 'ACTIVE'] } },
              orderBy: { expiresAt: 'desc' },
              take: 1,
              select: { expiresAt: true, status: true },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnrecoverableError('User not found for welcome email');
    }
    if (user.welcomeSentAt) {
      this.logger.debug(`Welcome already sent for user ${user.id}`);
      return { skipped: true, reason: 'already_sent' };
    }
    if (user.role !== 'OWNER') {
      // Invited staff must never get the owner welcome.
      await this.prisma.user.updateMany({
        where: { id: user.id, welcomeSentAt: null },
        data: { welcomeSentAt: new Date() },
      });
      return { skipped: true, reason: 'not_owner' };
    }

    const subscription = user.company.subscriptions[0];
    const trialEndsAt = subscription?.expiresAt ?? null;
    const origin = (this.config.get<string>('WEB_ORIGIN') ?? 'https://oborotix.com').replace(/\/$/, '');
    const locale = parseAppLocale(user.locale);

    const result = await this.mail.sendWelcomeEmail({
      to: user.email,
      name: user.name,
      companyName: user.company.name,
      locale,
      trialEndsAt,
      scanUrl: `${origin}/app`,
      helpUrl: `${origin}/app/help`,
    });

    // Mark sent after a successful SMTP send, or when SMTP is unset (dev log-only),
    // so we do not retry forever without a mail transport.
    if (result.delivered || result.skippedNoSmtp) {
      await this.prisma.user.updateMany({
        where: { id: user.id, welcomeSentAt: null },
        data: { welcomeSentAt: new Date() },
      });
    }

    return result;
  }
}
