import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SALES_MANAGER_ROLES, type AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SiteScoped } from '../auth/decorators/site-scoped.decorator';
import { SiteAccessGuard } from '../auth/guards/site-access.guard';
import { CreateSaleDto, MarginsQueryDto, SalesListQueryDto, SalesReportQueryDto, VoidSaleDto } from './dto/sales.dto';
import { SalesService } from './sales.service';

/** The till. Every role with access to the site can sell; voids and margins need a manager. */
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.sales.create(user, dto);
  }

  @Get()
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  list(@CurrentUser() user: AuthUser, @Query() query: SalesListQueryDto) {
    return this.sales.list(user, query);
  }

  @Get('report')
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  report(@CurrentUser() user: AuthUser, @Query() query: SalesReportQueryDto) {
    return this.sales.report(user, query);
  }

  @Get('margins')
  @Roles(...SALES_MANAGER_ROLES)
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  margins(@CurrentUser() user: AuthUser, @Query() query: MarginsQueryDto) {
    return this.sales.margins(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.get(user, id);
  }

  @Post(':id/void')
  @Roles(...SALES_MANAGER_ROLES)
  void(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidSaleDto) {
    return this.sales.void(user, id, dto);
  }
}
