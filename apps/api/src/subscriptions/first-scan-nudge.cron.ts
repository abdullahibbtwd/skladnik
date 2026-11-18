import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isEligibleForFirstScanNudge } from '@skladnik/shared';
import { FirstScanNudgeMailService } from '../mail/first-scan-nudge.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FirstScanNudgeCron {
  private readonly logger = new Logger(FirstScanNudgeCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nudgeMail: FirstScanNudgeMailService,
  ) {}

  /** Daily UTC morning: enqueue first-scan nudges for eligible trial companies. */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async enqueueDueNudges(now = new Date()) {
    const companies = await this.prisma.company.findMany({
      where: {
        nudgeSentAt: null,
        firstScanAt: null,
        createdAt: { lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        subscriptions: { some: { status: 'TRIAL', expiresAt: { gt: now } } },
        users: {
          some: {
            role: 'OWNER',
            isActive: true,
            emailVerifiedAt: { not: null },
          },
        },
      },
      select: {
        id: true,
        createdAt: true,
        firstScanAt: true,
        nudgeSentAt: true,
        subscriptions: {
          where: { status: 'TRIAL', expiresAt: { gt: now } },
          orderBy: { expiresAt: 'desc' },
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
        continue;
      }
      if (await this.nudgeMail.enqueue(company.id)) {
        enqueued += 1;
      }
    }

    if (enqueued > 0) {
      this.logger.log(`Enqueued ${enqueued} first-scan nudge email(s)`);
    }
    return enqueued;
  }
}
