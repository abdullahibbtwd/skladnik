import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '@skladnik/shared';
import { daysUntilExpiry, isExpiringSoon, isLiveSubscriptionStatus } from '@skladnik/shared';
import { apiBadRequest } from '../common/api-error';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivationFailureAlertsService } from './activation-failure-alerts.service';
import {
  hashActivationCode,
  isWellFormedActivationCode,
  normalizeActivationCode,
} from './activation-code';
import { redeemActivationCodeAtomic } from './redeem-activation';

const GENERIC_ACTIVATION_ERROR = 'Invalid or already used activation code';

@Injectable()
export class TenantSubscriptionsService {
  private readonly logger = new Logger(TenantSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly failureAlerts: ActivationFailureAlertsService,
  ) {}

  async current(user: AuthUser) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        companyId: user.companyId,
        status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const seatsUsed = await this.prisma.user.count({
      where: { companyId: user.companyId, isActive: true },
    });

    if (!subscription) {
      return {
        subscription: null,
        seatsUsed,
        seatsMax: null,
        daysRemaining: null,
        expiringSoon: false,
      };
    }

    const daysRemaining = subscription.expiresAt ? daysUntilExpiry(subscription.expiresAt) : null;
    const writable =
      subscription.status === 'TRIAL' ||
      subscription.status === 'ACTIVE';

    return {
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        maxUsers: subscription.maxUsers,
        termMonths: subscription.termMonths,
        startsAt: subscription.startsAt,
        expiresAt: subscription.expiresAt,
        activatedAt: subscription.activatedAt,
        isLive: isLiveSubscriptionStatus(subscription.status),
      },
      seatsUsed,
      seatsMax: subscription.maxUsers,
      daysRemaining,
      expiringSoon: writable && isExpiringSoon(subscription.expiresAt),
    };
  }

  async activate(user: AuthUser, rawCode: string) {
    if (!isWellFormedActivationCode(rawCode)) {
      this.fail();
    }

    const normalized = normalizeActivationCode(rawCode);
    const codeHash = hashActivationCode(normalized, this.config.getOrThrow<string>('ACTIVATION_CODE_PEPPER'));

    try {
      const result = await this.prisma.$transaction(
        async (tx) =>
          redeemActivationCodeAtomic(tx, {
            codeHash,
            companyId: user.companyId,
            userId: user.id,
          }),
        { isolationLevel: 'ReadCommitted', timeout: 15_000 },
      );

      if (!result) {
        await this.failureAlerts.recordFailedAttempt({
          codeHash,
          companyId: user.companyId,
          userId: user.id,
        });
        this.fail();
      }

      const activated = result;
      void this.sendActivationConfirmation(user.companyId, activated).catch((error) => {
        this.logger.warn(
          `Activation confirmation email failed for company ${user.companyId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

      return {
        subscription: {
          id: activated.subscriptionId,
          plan: activated.plan,
          status: 'ACTIVE' as const,
          maxUsers: activated.maxUsers,
          termMonths: activated.termMonths,
          startsAt: activated.startsAt,
          expiresAt: activated.expiresAt,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.fail();
    }
  }

  private async sendActivationConfirmation(
    companyId: string,
    result: {
      plan: string;
      expiresAt: Date;
    },
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        users: {
          where: { role: 'OWNER', isActive: true },
          select: { email: true, name: true },
        },
      },
    });
    if (!company) return;

    const origin = (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5176').replace(/\/$/, '');
    const settingsUrl = `${origin}/app/settings/subscription`;

    for (const owner of company.users) {
      await this.mail.sendSubscriptionActivatedEmail({
        to: owner.email,
        name: owner.name,
        companyName: company.name,
        plan: result.plan,
        expiresAt: result.expiresAt,
        settingsUrl,
      });
    }
  }

  private fail(): never {
    throw apiBadRequest('ACTIVATION_FAILED', GENERIC_ACTIVATION_ERROR);
  }
}
