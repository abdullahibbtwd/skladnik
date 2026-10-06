import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class MarkInvoicePaidDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  paymentReference!: string;

  /** ISO date (YYYY-MM-DD) or full ISO datetime. Defaults to now when omitted. */
  @IsOptional()
  @IsDateString()
  paymentDate?: string;
}
