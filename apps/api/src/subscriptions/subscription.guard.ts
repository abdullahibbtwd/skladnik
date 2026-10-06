import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { LIVE_SUBSCRIPTION_STATUSES, resolveEntitlement, type AuthUser } from '@skladnik/shared';
import { apiPaymentRequired } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAuthRealm } from '../auth/guards/auth-realm.guard';
import { ALLOW_WITHOUT_SUBSCRIPTION_KEY } from './decorators/allow-without-subscription.decorator';
import { wouldSubscriptionBlock } from './subscription-allowlist';

function isEnforceEnabled(raw: string | undefined): boolean {
  // Phase 6: default on when unset. Set SUBSCRIPTION_ENFORCE=false for shadow-only.
  if (raw === undefined || raw.trim() === '') return true;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * Tenant entitlement gate. Enforcement is on by default (SUBSCRIPTION_ENFORCE=false to shadow).
 * Exempt routes via @AllowWithoutSubscription (activation, exports, logout, password reset).
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const realm = resolveAuthRealm(this.reflector, context);
    if (realm === 'public' || realm === 'platform') {
      return true;
    }

    const allowWithout = Boolean(
      this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_SUBSCRIPTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]),
    );

    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: AuthUser;
    }>();
    const user = request.user;
    if (!user?.companyId) return true;

    const method = request.method ?? 'GET';
    const url = request.originalUrl ?? request.url ?? '/';

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        companyId: user.companyId,
        status: { in: [...LIVE_SUBSCRIPTION_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true, expiresAt: true },
    });

    const entitlement = resolveEntitlement(
      subscription
        ? { status: subscription.status, expiresAt: subscription.expiresAt }
        : null,
    );

    const wouldBlock = wouldSubscriptionBlock(entitlement.access, method, allowWithout);
    if (!wouldBlock) return true;

    const enforce = isEnforceEnabled(this.config.get<string>('SUBSCRIPTION_ENFORCE'));
    const payload = {
      mode: enforce ? 'enforce' : 'shadow',
      companyId: user.companyId,
      userId: user.id,
      method,
      path: url.split('?')[0],
      access: entitlement.access,
      reason: entitlement.reason,
      status: entitlement.status,
    };

    if (!enforce) {
      this.logger.warn(`subscription.shadow_would_block ${JSON.stringify(payload)}`);
      return true;
    }

    this.logger.warn(`subscription.enforce_block ${JSON.stringify(payload)}`);
    throw apiPaymentRequired(
      'SUBSCRIPTION_REQUIRED',
      entitlement.access === 'none'
        ? 'This workspace subscription has been revoked. Activate a new code to continue.'
        : 'Your subscription has expired or is suspended. You can still view and export data, or activate a new code.',
      { reason: entitlement.reason ?? 'NO_SUBSCRIPTION' },
    );
  }
}
