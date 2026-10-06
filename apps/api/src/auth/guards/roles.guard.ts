import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser, UserRole } from '@skladnik/shared';
import { apiForbidden } from '../../common/api-error';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { resolveAuthRealm } from './auth-realm.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const realm = resolveAuthRealm(this.reflector, context);
    if (realm === 'public' || realm === 'platform') {
      return true;
    }

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) {
      throw apiForbidden('INSUFFICIENT_ROLE', 'Нямате права за това действие');
    }
    return true;
  }
}
