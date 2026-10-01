import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { apiForbidden } from '../../common/api-error';
import { isAccountantMutationAllowed } from '../accountant-allowlist';

/**
 * ACC-01: central deny-by-default for Accountant mutations.
 * Registered as APP_GUARD so new endpoints are blocked unless allow-listed.
 */
@Injectable()
export class AccountantReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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
