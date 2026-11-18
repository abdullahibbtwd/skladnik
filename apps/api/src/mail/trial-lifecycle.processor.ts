import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isEligibleForTrialEndedEmail,
  isEligibleForTrialEndingEmail,
  parseAppLocale,
} from '@skladnik/shared';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import {
  TRIAL_ENDED_JOB,
  TRIAL_ENDING_JOB,
  TRIAL_LIFECYCLE_QUEUE,
  type TrialLifecycleJobData,
} from './trial-lifecycle.constants';

@Processor(TRIAL_LIFECYCLE_QUEUE, { concurrency: 2 })
export class TrialLifecycleProcessor extends WorkerHost {
  private readonly logger = new Logger(TrialLifecycleProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<TrialLifecycleJobData>) {
    if (job.name === TRIAL_ENDING_JOB) {
      return this.runEnding(job.data.companyId, new Date());
    }
    if (job.name === TRIAL_ENDED_JOB) {
      return this.runEnded(job.data.companyId, new Date());
    }
    throw new UnrecoverableError(`Unknown trial lifecycle job: ${job.name}`);
  }

  async runEnding(companyId: string, now: Date) {
    const company = await this.loadCompany(companyId, ['TRIAL']);
    if (!company) throw new UnrecoverableError('Company not found for trial-ending email');
    if (company.trialEndingSentAt) {
      return { skipped: true, reason: 'already_sent' };
    }

    const owner = company.users[0];
    const sub = company.subscriptions[0];
    if (
      !owner ||
      !sub ||
      !isEligibleForTrialEndingEmail({
        now,
        trialEndingSentAt: company.trialEndingSentAt,
        subscriptionStatus: sub.status,
        subscriptionExpiresAt: sub.expiresAt,
        ownerEmailVerifiedAt: owner.emailVerifiedAt,
      })
    ) {
      return { skipped: true, reason: 'not_eligible' };
    }

    const origin = this.origin();
    const locale = parseAppLocale(owner.locale);
    const result = await this.mail.sendTrialEndingEmail({
      to: owner.email,
      name: owner.name,
      locale,
      settingsUrl: `${origin}/app/settings/subscription`,
    });

    if (result.delivered || result.skippedNoSmtp) {
      await this.prisma.company.updateMany({
        where: { id: company.id, trialEndingSentAt: null },
        data: { trialEndingSentAt: now },
      });
    }
    return result;
  }

  async runEnded(companyId: string, now: Date) {
    const company = await this.loadCompany(companyId, ['TRIAL', 'EXPIRED']);
    if (!company) throw new UnrecoverableError('Company not found for trial-ended email');
    if (company.trialEndedSentAt) {
      return { skipped: true, reason: 'already_sent' };
    }

    const owner = company.users[0];
    const sub = company.subscriptions[0];
    if (
      !owner ||
      !sub ||
      !isEligibleForTrialEndedEmail({
        now,
        trialEndedSentAt: company.trialEndedSentAt,
        subscriptionStatus: sub.status,
        subscriptionExpiresAt: sub.expiresAt,
        ownerEmailVerifiedAt: owner.emailVerifiedAt,
      })
    ) {
      return { skipped: true, reason: 'not_eligible' };
    }

    const origin = this.origin();
    const locale = parseAppLocale(owner.locale);
    const result = await this.mail.sendTrialEndedEmail({
      to: owner.email,
      name: owner.name,
      locale,
      quoteUrl: `${origin}/#quote`,
    });

    if (result.delivered || result.skippedNoSmtp) {
      await this.prisma.company.updateMany({
        where: { id: company.id, trialEndedSentAt: null },
        data: { trialEndedSentAt: now },
      });
    }
    return result;
  }

  private origin() {
    return (this.config.get<string>('WEB_ORIGIN') ?? 'https://oborotix.com').replace(/\/$/, '');
  }

  private loadCompany(companyId: string, statuses: string[]) {
    return this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        trialEndingSentAt: true,
        trialEndedSentAt: true,
        subscriptions: {
          where: { status: { in: statuses as ('TRIAL' | 'EXPIRED')[] } },
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
  }
}
