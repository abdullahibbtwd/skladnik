import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  EXPIRY_REMINDER_DAYS,
  reminderEventPayload,
  type ExpiryReminderDays,
} from '@skladnik/shared';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const REMINDER_STATUSES = ['TRIAL', 'ACTIVE'] as const;

@Injectable()
export class SubscriptionRemindersService {
  private readonly logger = new Logger(SubscriptionRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Daily UTC morning sweep for 30/14/7/1-day expiry reminders. */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDueReminders(now = new Date()) {
    let sent = 0;
    for (const daysBefore of EXPIRY_REMINDER_DAYS) {
      sent += await this.sendForBucket(daysBefore, now);
    }
    if (sent > 0) {
      this.logger.log(`Sent ${sent} subscription expiry reminder email(s)`);
    }
    return sent;
  }

  private async sendForBucket(daysBefore: ExpiryReminderDays, now: Date) {
    const target = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysBefore),
    );
    const dayStart = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
    const dayEnd = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 23, 59, 59, 999),
    );

    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: [...REMINDER_STATUSES] },
        companyId: { not: null },
        expiresAt: { gte: dayStart, lte: dayEnd },
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            users: {
              where: { role: 'OWNER', isActive: true },
              select: { email: true, name: true },
            },
          },
        },
        events: {
          where: { type: 'NOTE' },
          select: { payload: true },
        },
      },
    });

    let sent = 0;
    for (const sub of subscriptions) {
      if (!sub.company || !sub.expiresAt) continue;
      if (this.alreadyReminded(sub.events, daysBefore, sub.expiresAt)) continue;

      const settingsUrl = this.settingsUrl();
      for (const owner of sub.company.users) {
        try {
          await this.mail.sendSubscriptionExpiryReminder({
            to: owner.email,
            name: owner.name,
            companyName: sub.company.name,
            daysBefore,
            expiresAt: sub.expiresAt,
            settingsUrl,
          });
          sent += 1;
        } catch (error) {
          this.logger.warn(
            `Expiry reminder failed for ${owner.email} / sub ${sub.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      await this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: 'NOTE',
          actorType: 'SYSTEM',
          payload: reminderEventPayload(daysBefore, sub.expiresAt),
        },
      });
    }
    return sent;
  }

  private alreadyReminded(
    events: { payload: unknown }[],
    daysBefore: ExpiryReminderDays,
    expiresAt: Date,
  ) {
    const target = expiresAt.toISOString();
    return events.some((event) => {
      const p = event.payload as { kind?: string; daysBefore?: number; forExpiresAt?: string } | null;
      return (
        p?.kind === 'expiry_reminder' &&
        p.daysBefore === daysBefore &&
        p.forExpiresAt === target
      );
    });
  }

  private settingsUrl() {
    const origin = (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5176').replace(/\/$/, '');
    return `${origin}/app/settings/subscription`;
  }
}
