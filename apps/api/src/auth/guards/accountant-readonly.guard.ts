import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '@skladnik/shared';
import { apiForbidden } from '../../common/api-error';
import { isAccountantMutationAllowed } from '../accountant-allowlist';
import { resolveAuthRealm } from './auth-realm.guard';

/**
 * ACC-01: central deny-by-default for Accountant mutations.
 * Registered as APP_GUARD so new endpoints are blocked unless allow-listed.
 */
@Injectable()
export class AccountantReadOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const realm = resolveAuthRealm(this.reflector, context);
    if (realm === 'public' || realm === 'platform') {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: AuthUser;
    }>();
    const user = request.user;
    if (!user || user.role !== 'ACCOUNTANT') return true;

    const method = request.method ?? 'GET';
    const url = request.originalUrl ?? request.url ?? '/';
    if (isAccountantMutationAllowed(method, url)) return true;

    throw apiForbidden(
      'ACCOUNTANT_READ_ONLY',
      'Счетоводителят има само право на преглед и експорт. Промени по данни не са позволени.',
    );
  }
}
