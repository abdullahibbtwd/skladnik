import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SiteScoped } from '../auth/decorators/site-scoped.decorator';
import { SiteAccessGuard } from '../auth/guards/site-access.guard';
import { MovementsQueryDto, StockQueryDto } from './dto/stock-query.dto';
import { StockService } from './stock.service';
import { Tenant } from '../auth/decorators/auth-realm.decorator';

@Tenant()
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  levels(@CurrentUser() user: AuthUser, @Query() query: StockQueryDto) {
    return this.stock.levels(user, query.siteId);
  }

  @Get('movements')
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  movements(@CurrentUser() user: AuthUser, @Query() query: MovementsQueryDto) {
    return this.stock.movements(user, query.siteId, query.productId, query.batchId);
  }

  @Get('reorder')
  @UseGuards(SiteAccessGuard)
  @SiteScoped('siteId')
  reorder(@CurrentUser() user: AuthUser, @Query() query: StockQueryDto) {
    return this.stock.reorder(user, query.siteId);
  }
}
