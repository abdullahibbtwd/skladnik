import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '@skladnik/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SITE_SCOPED_KEY } from '../decorators/site-scoped.decorator';

type RequestShape = {
  user?: AuthUser;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

@Injectable()
export class SiteAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const field = this.reflector.getAllAndOverride<string>(SITE_SCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!field) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestShape>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Missing session');
    }

    const siteId = [request.params?.[field], request.query?.[field], request.body?.[field]].find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    if (!siteId) {
      throw new ForbiddenException(`Missing ${field}`);
    }

    const site = await this.prisma.site.findFirst({
      where: { id: siteId, companyId: user.companyId },
      select: { id: true },
    });
    if (!site) {
      throw new ForbiddenException('Site is outside your company');
    }

    if (!user.allSites && !user.siteIds.includes(siteId)) {
      throw new ForbiddenException('Site is outside your assigned locations');
    }

    return true;
  }
}
