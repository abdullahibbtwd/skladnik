import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUOTE_NOTIFY_QUEUE, type QuoteNotifyJobData } from './quote-notify.constants';

@Processor(QUOTE_NOTIFY_QUEUE, { concurrency: 2 })
export class QuoteNotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(QuoteNotifyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<QuoteNotifyJobData>) {
    const to = this.config.get<string>('QUOTE_NOTIFY_EMAIL')?.trim();
    if (!to) {
      this.logger.warn('QUOTE_NOTIFY_EMAIL is not set — skipping quote notification');
      throw new UnrecoverableError('QUOTE_NOTIFY_EMAIL is not configured');
    }

    const quote = await this.prisma.quoteRequest.findUnique({ where: { id: job.data.quoteRequestId } });
    if (!quote) {
      throw new UnrecoverableError('Quote request not found');
    }

    return this.mail.sendQuoteRequestNotifyEmail({
      to,
      quote: {
        id: quote.id,
        name: quote.name,
        businessType: quote.businessType,
        locations: quote.locations,
        contact: quote.contact,
        message: quote.message,
        locale: quote.locale,
        utmSource: quote.utmSource,
        utmMedium: quote.utmMedium,
        utmCampaign: quote.utmCampaign,
        referrer: quote.referrer,
        createdAt: quote.createdAt,
      },
    });
  }
}
