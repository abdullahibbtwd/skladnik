import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { resolveAuthRealm } from './auth-realm.guard';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const realm = resolveAuthRealm(this.reflector, context);
    if (realm === 'public' || realm === 'platform') {
      return true;
    }
    return super.canActivate(context);
  }
}
