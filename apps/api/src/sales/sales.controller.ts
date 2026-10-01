import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { OPERATIONAL_MANAGER_ROLES, POS_ROLES, SALES_MANAGER_ROLES, SALES_READ_ROLES, type AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SiteScoped } from '../auth/decorators/site-scoped.decorator';
import { SiteAccessGuard } from '../auth/guards/site-access.guard';
import { CreateSaleDto, MarginsQueryDto, SalesListQueryDto, SalesReportQueryDto, VoidSaleDto } from './dto/sales.dto';
import { SalesService } from './sales.service';

/**
 * The till. SKL-07: STAFF is blocked (403); CASHIER + operational managers sell.
 * ACC-01: Accountant may read sales/reports but not create or void.
 */
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @Roles(...POS_ROLES)
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.sales.create(user, dto);
  }

  @Get()
  @Roles(...SALES_READ_ROLES)
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  list(@CurrentUser() user: AuthUser, @Query() query: SalesListQueryDto) {
    return this.sales.list(user, query);
  }

  @Get('report')
  @Roles(...SALES_READ_ROLES)
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
  @Roles(...SALES_READ_ROLES)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.get(user, id);
  }

  @Post(':id/void')
  @Roles(...OPERATIONAL_MANAGER_ROLES)
  void(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidSaleDto) {
    return this.sales.void(user, id, dto);
  }
}
