import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { parseAppLocale } from '@skladnik/shared';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto';
import {
  QUOTE_NOTIFY_JOB,
  QUOTE_NOTIFY_JOB_OPTIONS,
  QUOTE_NOTIFY_QUEUE,
  quoteNotifyJobId,
  type QuoteNotifyJobData,
} from './quote-notify.constants';

@Injectable()
export class QuoteRequestsService {
  private readonly logger = new Logger(QuoteRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUOTE_NOTIFY_QUEUE) private readonly queue: Queue<QuoteNotifyJobData>,
  ) {}

  async create(dto: CreateQuoteRequestDto): Promise<{ ok: true; id?: string; discarded?: boolean }> {
    // Honeypot: pretend success so bots do not adapt.
    if (dto.website?.trim()) {
      this.logger.debug('Discarded quote request (honeypot filled)');
      return { ok: true, discarded: true };
    }

    const created = await this.prisma.quoteRequest.create({
      data: {
        name: dto.name.trim(),
        businessType: dto.businessType.trim(),
        locations: dto.locations,
        contact: dto.contact.trim(),
        message: dto.message?.trim() || null,
        locale: parseAppLocale(dto.locale),
        utmSource: dto.utmSource?.trim() || null,
        utmMedium: dto.utmMedium?.trim() || null,
        utmCampaign: dto.utmCampaign?.trim() || null,
        referrer: dto.referrer?.trim() || null,
      },
    });

    try {
      await this.queue.add(
        QUOTE_NOTIFY_JOB,
        { quoteRequestId: created.id },
        { jobId: quoteNotifyJobId(created.id), ...QUOTE_NOTIFY_JOB_OPTIONS },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Quote ${created.id} saved but notify enqueue failed: ${detail}`);
    }

    return { ok: true, id: created.id };
  }
}
