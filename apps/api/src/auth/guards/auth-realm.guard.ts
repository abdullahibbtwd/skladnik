import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { apiForbidden } from '../../common/api-error';
import { AUTH_REALM_KEY, type AuthRealm } from '../decorators/auth-realm.decorator';

/**
 * Default-deny: every route must be marked @Public, @Tenant, or @Platform.
 * Runs before JWT guards so unmarked handlers never fall through to auth.
 */
@Injectable()
export class AuthRealmGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const realm = this.reflector.getAllAndOverride<AuthRealm | undefined>(AUTH_REALM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!realm) {
      throw apiForbidden(
        'ROUTE_UNCLASSIFIED',
        'This route is missing an auth realm (@Public, @Tenant, or @Platform).',
      );
    }
    return true;
  }
}

export function resolveAuthRealm(
  reflector: Reflector,
  context: ExecutionContext,
): AuthRealm | undefined {
  return reflector.getAllAndOverride<AuthRealm | undefined>(AUTH_REALM_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
}
