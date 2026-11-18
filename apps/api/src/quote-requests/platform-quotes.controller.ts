import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Platform } from '../auth/decorators/auth-realm.decorator';
import { AnalyticsSummaryQueryDto } from './dto/analytics-summary.dto';
import { ListPlatformQuotesQueryDto } from './dto/list-platform-quotes.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { PlatformQuotesService } from './platform-quotes.service';

@Platform()
@Controller('platform/quotes')
export class PlatformQuotesController {
  constructor(private readonly quotes: PlatformQuotesService) {}

  @Get()
  list(@Query() query: ListPlatformQuotesQueryDto) {
    return this.quotes.list(query);
  }

  @Get('recent-new')
  recentNew() {
    return this.quotes.listRecentNew(5);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotes.get(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteStatusDto) {
    return this.quotes.updateStatus(id, dto.status);
  }
}

@Platform()
@Controller('platform/analytics')
export class PlatformAnalyticsController {
  constructor(private readonly analytics: PlatformAnalyticsService) {}

  @Get('summary')
  summary(@Query() query: AnalyticsSummaryQueryDto) {
    return this.analytics.summary(query.days ?? 30);
  }
}
