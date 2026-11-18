import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEligibleForFirstScanNudge, parseAppLocale } from '@skladnik/shared';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { FIRST_SCAN_NUDGE_QUEUE, type FirstScanNudgeJobData } from './first-scan-nudge.constants';
import { MailService } from './mail.service';

@Processor(FIRST_SCAN_NUDGE_QUEUE, { concurrency: 2 })
export class FirstScanNudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(FirstScanNudgeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<FirstScanNudgeJobData>) {
    return this.run(job.data.companyId, new Date());
  }

  /** Test seam: inject a fake clock without breaking WorkerHost.process(token). */
  async run(companyId: string, now: Date) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        firstScanAt: true,
        nudgeSentAt: true,
        subscriptions: {
          where: { status: 'TRIAL' },
          orderBy: { expiresAt: 'desc' },
          take: 1,
          select: { status: true, expiresAt: true },
        },
        users: {
          where: { role: 'OWNER', isActive: true },
          select: {
            email: true,
            name: true,
            locale: true,
            emailVerifiedAt: true,
          },
          take: 1,
        },
      },
    });

    if (!company) {
      throw new UnrecoverableError('Company not found for first-scan nudge');
    }
    if (company.nudgeSentAt) {
      this.logger.debug(`First-scan nudge already sent for company ${company.id}`);
      return { skipped: true, reason: 'already_sent' };
    }

    const owner = company.users[0];
    const sub = company.subscriptions[0];
    if (
      !owner ||
      !sub ||
      !isEligibleForFirstScanNudge({
        now,
        companyCreatedAt: company.createdAt,
        firstScanAt: company.firstScanAt,
        nudgeSentAt: company.nudgeSentAt,
        subscriptionStatus: sub.status,
        subscriptionExpiresAt: sub.expiresAt,
        ownerEmailVerifiedAt: owner.emailVerifiedAt,
      })
    ) {
      return { skipped: true, reason: 'not_eligible' };
    }

    const origin = (this.config.get<string>('WEB_ORIGIN') ?? 'https://oborotix.com').replace(/\/$/, '');
    const locale = parseAppLocale(owner.locale);
    const result = await this.mail.sendFirstScanNudgeEmail({
      to: owner.email,
      name: owner.name,
      locale,
      appUrl: `${origin}/app`,
    });

    if (result.delivered || result.skippedNoSmtp) {
      await this.prisma.company.updateMany({
        where: { id: company.id, nudgeSentAt: null },
        data: { nudgeSentAt: now },
      });
    }

    return result;
  }
}
