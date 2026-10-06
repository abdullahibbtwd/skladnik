import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PlatformAuthUser } from '../platform-auth.types';

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformAuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: PlatformAuthUser }>();
    return request.user;
  },
);
