import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { resolveAuthRealm } from '../../auth/guards/auth-realm.guard';
import { PLATFORM_JWT_STRATEGY } from '../platform-auth.constants';

/** Requires a platform JWT on @Platform() routes; skips public and tenant. */
@Injectable()
export class PlatformGuard extends AuthGuard(PLATFORM_JWT_STRATEGY) {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const realm = resolveAuthRealm(this.reflector, context);
    if (realm === 'public' || realm === 'tenant') {
      return true;
    }
    return super.canActivate(context);
  }
}
