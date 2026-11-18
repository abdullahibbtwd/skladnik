import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit, type RateLimitRule } from '../auth/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto';
import { QuoteRequestsService } from './quote-requests.service';

const QUOTE_LIMIT: RateLimitRule = {
  name: 'quote-request',
  limit: 8,
  windowSeconds: 60 * 60,
  by: 'ip',
};

@Controller('public/quote-requests')
export class QuoteRequestsController {
  constructor(private readonly quotes: QuoteRequestsService) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(QUOTE_LIMIT)
  @Post()
  create(@Body() dto: CreateQuoteRequestDto) {
    return this.quotes.create(dto);
  }
}
