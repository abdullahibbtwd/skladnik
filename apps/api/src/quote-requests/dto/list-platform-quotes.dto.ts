import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { QUOTE_REQUEST_STATUSES, type QuoteRequestStatus } from '@skladnik/shared';

export class ListPlatformQuotesQueryDto {
  @IsOptional()
  @IsIn(QUOTE_REQUEST_STATUSES)
  status?: QuoteRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
