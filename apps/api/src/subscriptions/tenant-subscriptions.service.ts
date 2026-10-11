import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser, ActivationEikMismatchMode, ActivationKind } from '@skladnik/shared';
import {
  computeActivationSchedule,
  daysUntilExpiry,
  DEFAULT_ACTIVATION_EIK_MISMATCH_MODE,
  isExpiringSoon,
  isLiveSubscriptionStatus,
  normaliseEik,
} from '@skladnik/shared';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  activationCodeAlreadyUsedError,
  eikMismatchBlockedError,
  eikMismatchConfirmRequiredError,
  invalidActivationCodeError,
} from './activation-activate.errors';
import { ActivationFailureAlertsService } from './activation-failure-alerts.service';
import {
  activationCodeHashCandidates,
  isWellFormedActivationCode,
  normalizeActivationCode,
} from './activation-code';
import { promoteDueQueuedSubscriptions, redeemActivationCodeAtomic } from './redeem-activation';

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
    await this.prisma.$transaction((tx) => promoteDueQueuedSubscriptions(tx)).catch((error) => {
      this.logger.warn(
        `Queued promotion skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

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
    const writable = subscription.status === 'TRIAL' || subscription.status === 'ACTIVE';

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

  async preview(user: AuthUser, rawCode: string) {
    const resolved = await this.resolveRedeemableCode(rawCode);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: { eik: true },
    });
    const current = await this.prisma.subscription.findFirst({
      where: {
        companyId: user.companyId,
        status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { plan: true, expiresAt: true, status: true },
    });

    const schedule = computeActivationSchedule({
      newPlan: resolved.plan,
      termMonths: resolved.termMonths,
      now: new Date(),
      current: current ? { plan: current.plan, expiresAt: current.expiresAt } : null,
    });

    const buyerEik = resolved.buyerEik;
    const companyEik = company.eik ? normaliseEik(company.eik) : null;
    // No invoice buyer EIK → skip mismatch gate (legacy / incomplete deals).
    const eikMatchesCompany =
      !buyerEik || Boolean(companyEik && normaliseEik(buyerEik) === companyEik);

    return {
      plan: resolved.plan,
      termMonths: resolved.termMonths,
      kind: schedule.kind as ActivationKind,
      currentPlan: current?.plan ?? null,
      currentExpires: current?.expiresAt?.toISOString() ?? null,
      resultingExpires: schedule.expiresAt.toISOString(),
      resultingStartsAt: schedule.startsAt.toISOString(),
      resultingStatus: schedule.status,
      buyerEik,
      eikMatchesCompany,
      eikMismatchMode: await this.eikMismatchMode(),
    };
  }

  async activate(user: AuthUser, rawCode: string, confirmEikMismatch = false) {
    const resolved = await this.resolveRedeemableCode(rawCode);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: { eik: true },
    });

    const buyerEik = resolved.buyerEik;
    const companyEik = company.eik ? normaliseEik(company.eik) : null;
    const eikMatches =
      !buyerEik || Boolean(companyEik && normaliseEik(buyerEik) === companyEik);
    const mode = await this.eikMismatchMode();

    let eikMismatchAudit: { buyerEik: string; companyEik: string | null } | null = null;
    if (buyerEik && !eikMatches) {
      if (mode === 'BLOCK') {
        throw eikMismatchBlockedError(buyerEik, companyEik);
      }
      if (!confirmEikMismatch) {
        throw eikMismatchConfirmRequiredError(buyerEik, companyEik);
      }
      eikMismatchAudit = { buyerEik, companyEik };
    }

    try {
      const result = await this.prisma.$transaction(
        async (tx) =>
          redeemActivationCodeAtomic(tx, {
            codeHash: resolved.codeHash,
            companyId: user.companyId,
            userId: user.id,
            eikMismatchAudit,
          }),
        { isolationLevel: 'ReadCommitted', timeout: 15_000 },
      );

      if (!result) {
        const again = await this.prisma.activationCode.findFirst({
          where: { codeHash: resolved.codeHash },
          select: { redeemedAt: true },
        });
        if (again?.redeemedAt) {
          throw activationCodeAlreadyUsedError(again.redeemedAt);
        }
        await this.failureAlerts.recordFailedAttempt({
          codeHash: resolved.codeHash,
          companyId: user.companyId,
          userId: user.id,
        });
        throw invalidActivationCodeError();
      }

      if (result.status === 'ACTIVE') {
        void this.sendActivationConfirmation(user.companyId, result).catch((error) => {
          this.logger.warn(
            `Activation confirmation email failed for company ${user.companyId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }

      return {
        subscription: {
          id: result.subscriptionId,
          plan: result.plan,
          status: result.status,
          maxUsers: result.maxUsers,
          termMonths: result.termMonths,
          startsAt: result.startsAt,
          expiresAt: result.expiresAt,
          kind: result.kind,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw invalidActivationCodeError();
    }
  }

  private async resolveRedeemableCode(rawCode: string) {
    const normalized = normalizeActivationCode(rawCode);
    if (!normalized || !isWellFormedActivationCode(rawCode)) {
      throw invalidActivationCodeError();
    }

    const pepper = this.config.getOrThrow<string>('ACTIVATION_CODE_PEPPER');
    const hashCandidates = activationCodeHashCandidates(normalized, pepper);

    const existing = await this.prisma.activationCode.findFirst({
      where: { codeHash: { in: hashCandidates } },
      select: {
        codeHash: true,
        redeemedAt: true,
        revokedAt: true,
        expiresAt: true,
        subscription: {
          select: {
            plan: true,
            termMonths: true,
            status: true,
            companyId: true,
            invoices: {
              orderBy: { issuedAt: 'desc' },
              take: 1,
              select: { buyerEik: true },
            },
          },
        },
      },
    });

    if (!existing) {
      throw invalidActivationCodeError();
    }
    if (existing.redeemedAt) {
      throw activationCodeAlreadyUsedError(existing.redeemedAt);
    }
    if (
      existing.revokedAt ||
      existing.expiresAt.getTime() <= Date.now() ||
      existing.subscription.status !== 'PENDING' ||
      existing.subscription.companyId
    ) {
      throw invalidActivationCodeError();
    }

    return {
      codeHash: existing.codeHash,
      plan: existing.subscription.plan,
      termMonths: existing.subscription.termMonths,
      buyerEik: existing.subscription.invoices[0]?.buyerEik ?? null,
    };
  }

  private async eikMismatchMode(): Promise<ActivationEikMismatchMode> {
    const row = await this.prisma.platformBillingSettings.findUnique({
      where: { id: 'default' },
      select: { activationEikMismatchMode: true },
    });
    const mode = row?.activationEikMismatchMode;
    if (mode === 'WARN' || mode === 'BLOCK') return mode;
    return DEFAULT_ACTIVATION_EIK_MISMATCH_MODE;
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
}
