import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '@skladnik/shared';
import { resolveAuthRealm } from './auth-realm.guard';

type RequestShape = {
  user?: AuthUser;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

/**
 * Multi-tenant safety net: never honour a companyId from the client.
 * JWT companyId is the only source of truth.
 */
@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const realm = resolveAuthRealm(this.reflector, context);
    if (realm === 'public' || realm === 'platform') {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestShape>();
    const user = request.user;
    if (!user?.companyId) {
      throw new ForbiddenException('Missing company scope');
    }

    const claimed = [request.body?.companyId, request.query?.companyId, request.params?.companyId]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (claimed.some((id) => id !== user.companyId)) {
      throw new ForbiddenException('companyId in the request does not match the session');
    }

    if (request.body && 'companyId' in request.body) {
      delete request.body.companyId;
    }

    return true;
  }
}
