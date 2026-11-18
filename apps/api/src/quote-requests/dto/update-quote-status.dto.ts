import { IsIn } from 'class-validator';
import { QUOTE_REQUEST_STATUSES, type QuoteRequestStatus } from '@skladnik/shared';

export class UpdateQuoteStatusDto {
  @IsIn(QUOTE_REQUEST_STATUSES)
  status!: QuoteRequestStatus;
}
