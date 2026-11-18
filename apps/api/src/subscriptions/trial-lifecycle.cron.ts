import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isEligibleForTrialEndedEmail, isEligibleForTrialEndingEmail } from '@skladnik/shared';
import { TrialLifecycleMailService } from '../mail/trial-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrialLifecycleCron {
  private readonly logger = new Logger(TrialLifecycleCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleMail: TrialLifecycleMailService,
  ) {}

  /** Daily UTC morning: trial "3 days left" + day-after-expiry emails. */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async enqueueDue(now = new Date()) {
    const ending = await this.enqueueEnding(now);
    const ended = await this.enqueueEnded(now);
    if (ending + ended > 0) {
      this.logger.log(`Enqueued ${ending} trial-ending and ${ended} trial-ended email(s)`);
    }
    return { ending, ended };
  }

  async enqueueEnding(now = new Date()) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3));
    const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const dayEnd = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 23, 59, 59, 999),
    );

    const companies = await this.prisma.company.findMany({
      where: {
        trialEndingSentAt: null,
        subscriptions: {
          some: {
            status: 'TRIAL',
            expiresAt: { gte: dayStart, lte: dayEnd },
          },
        },
        users: {
          some: { role: 'OWNER', isActive: true, emailVerifiedAt: { not: null } },
        },
      },
      select: {
        id: true,
        trialEndingSentAt: true,
        subscriptions: {
          where: { status: 'TRIAL', expiresAt: { gte: dayStart, lte: dayEnd } },
          take: 1,
          select: { status: true, expiresAt: true },
        },
        users: {
          where: { role: 'OWNER', isActive: true, emailVerifiedAt: { not: null } },
          select: { emailVerifiedAt: true },
          take: 1,
        },
      },
      take: 500,
    });

    let enqueued = 0;
    for (const company of companies) {
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
        continue;
      }
      if (await this.lifecycleMail.enqueueEnding(company.id)) enqueued += 1;
    }
    return enqueued;
  }

  async enqueueEnded(now = new Date()) {
    const yesterday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
    );
    const dayStart = new Date(
      Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate()),
    );
    const dayEnd = new Date(
      Date.UTC(
        yesterday.getUTCFullYear(),
        yesterday.getUTCMonth(),
        yesterday.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const companies = await this.prisma.company.findMany({
      where: {
        trialEndedSentAt: null,
        subscriptions: {
          some: {
            status: { in: ['TRIAL', 'EXPIRED'] },
            expiresAt: { gte: dayStart, lte: dayEnd },
          },
        },
        users: {
          some: { role: 'OWNER', isActive: true, emailVerifiedAt: { not: null } },
        },
      },
      select: {
        id: true,
        trialEndedSentAt: true,
        subscriptions: {
          where: {
            status: { in: ['TRIAL', 'EXPIRED'] },
            expiresAt: { gte: dayStart, lte: dayEnd },
          },
          take: 1,
          select: { status: true, expiresAt: true },
        },
        users: {
          where: { role: 'OWNER', isActive: true, emailVerifiedAt: { not: null } },
          select: { emailVerifiedAt: true },
          take: 1,
        },
      },
      take: 500,
    });

    let enqueued = 0;
    for (const company of companies) {
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
        continue;
      }
      if (await this.lifecycleMail.enqueueEnded(company.id)) enqueued += 1;
    }
    return enqueued;
  }
}
