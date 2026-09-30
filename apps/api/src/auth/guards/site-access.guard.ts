import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '@skladnik/shared';
import { apiBadRequest, apiForbidden } from '../../common/api-error';
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
      throw apiForbidden('MISSING_SESSION', 'Missing session');
    }

    const siteId = [request.params?.[field], request.query?.[field], request.body?.[field]].find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    if (!siteId) {
      throw apiBadRequest('MISSING_SITE_ID', `Missing ${field}`, { field });
    }

    const site = await this.prisma.site.findFirst({
      where: { id: siteId, companyId: user.companyId },
      select: { id: true, isActive: true },
    });
    if (!site) {
      throw apiForbidden('SITE_OUTSIDE_COMPANY', 'Site is outside your company');
    }

    if (!site.isActive && !user.allSites) {
      throw apiForbidden('SITE_OUTSIDE_SCOPE', 'Site is outside your assigned locations');
    }

    if (!user.allSites && !user.siteIds.includes(siteId)) {
      throw apiForbidden('SITE_OUTSIDE_SCOPE', 'Site is outside your assigned locations');
    }

    return true;
  }
}
