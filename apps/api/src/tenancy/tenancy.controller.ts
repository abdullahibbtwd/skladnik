import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SiteScoped } from '../auth/decorators/site-scoped.decorator';
import { SiteAccessGuard } from '../auth/guards/site-access.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('tenancy')
export class TenancyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('snapshot')
  async snapshot(@CurrentUser() user: AuthUser, @Query('companyId') _ignored?: string) {
    const [company, userCount, siteCount, productCount] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: user.companyId },
        select: { id: true, name: true },
      }),
      this.prisma.user.count({ where: { companyId: user.companyId } }),
      this.prisma.site.count({ where: { companyId: user.companyId } }),
      this.prisma.product.count({ where: { companyId: user.companyId } }),
    ]);

    return {
      companyId: company.id,
      companyName: company.name,
      userCount,
      siteCount,
      productCount,
      role: user.role,
      allSites: user.allSites,
    };
  }

  @Get('sites')
  async sites(@CurrentUser() user: AuthUser) {
    const where = user.allSites
      ? { companyId: user.companyId }
      : { companyId: user.companyId, id: { in: user.siteIds } };

    const sites = await this.prisma.site.findMany({
      where,
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });

    return { sites };
  }

  @Get('sites/:siteId')
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  async site(@Param('siteId') siteId: string, @CurrentUser() user: AuthUser) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, companyId: user.companyId },
      select: { id: true, name: true, type: true, companyId: true },
    });
    if (!site) {
      throw new ForbiddenException('Site is outside your company');
    }
    return { site };
  }

  @Get('owner-only')
  @Roles('OWNER')
  ownerOnly(@CurrentUser() user: AuthUser) {
    return { ok: true, role: user.role, companyId: user.companyId };
  }
}
