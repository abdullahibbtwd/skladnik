import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class VoidInvoiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason?: string;
}
