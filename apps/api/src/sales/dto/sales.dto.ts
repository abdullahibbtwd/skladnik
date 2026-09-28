import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PAYMENT_METHODS, type PaymentMethod } from '@skladnik/shared';
import type { MarginGrouping } from '../sales-report';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SaleItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100_000)
  quantity!: number;

  /** Manual batch override; otherwise the batch is chosen FEFO. */
  @IsOptional()
  @IsUUID()
  batchId?: string;

  /** Price per unit including VAT. Omit to sell at the catalog price; changing it needs a manager. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000)
  unitPrice?: number;
}

export class CreateSaleDto {
  @IsUUID()
  siteId!: string;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  /** Sent again unchanged when the till retries, so the sale is recorded once. */
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;

  @IsOptional()
  @IsBoolean()
  confirmExpired?: boolean;
}

export class VoidSaleDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SalesListQueryDto {
  @IsUUID()
  siteId!: string;

  @IsOptional()
  @Matches(DATE)
  date?: string;
}

export class SalesReportQueryDto {
  @IsUUID()
  siteId!: string;

  @IsOptional()
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Matches(DATE)
  to?: string;
}

export class MarginsQueryDto extends SalesReportQueryDto {
  @IsOptional()
  @IsIn(['product', 'group'])
  by?: MarginGrouping;
}
