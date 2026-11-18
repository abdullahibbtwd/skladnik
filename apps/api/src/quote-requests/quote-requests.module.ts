import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { QUOTE_NOTIFY_JOB_OPTIONS, QUOTE_NOTIFY_QUEUE } from './quote-notify.constants';
import { QuoteNotifyProcessor } from './quote-notify.processor';
import { PlatformAnalyticsController, PlatformQuotesController } from './platform-quotes.controller';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { PlatformQuotesService } from './platform-quotes.service';
import { QuoteRequestsController } from './quote-requests.controller';
import { QuoteRequestsService } from './quote-requests.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUOTE_NOTIFY_QUEUE,
      defaultJobOptions: QUOTE_NOTIFY_JOB_OPTIONS,
    }),
  ],
  controllers: [QuoteRequestsController, PlatformQuotesController, PlatformAnalyticsController],
  providers: [
    QuoteRequestsService,
    QuoteNotifyProcessor,
    RateLimitGuard,
    PlatformQuotesService,
    PlatformAnalyticsService,
  ],
  exports: [PlatformQuotesService],
})
export class QuoteRequestsModule {}
