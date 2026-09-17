import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  DOCUMENT_TYPES,
  STOCK_DIRECTIONS,
  type DocumentType,
  type StockDirection,
} from '@skladnik/shared';

export function lineQuantity(dto: { quantity?: number; qty?: number }) {
  const value = dto.quantity ?? dto.qty;
  if (value === undefined || Number.isNaN(Number(value))) {
    throw new Error('QUANTITY_REQUIRED');
  }
  return Number(value);
}

export class CreateDocumentDto {
  @IsIn(DOCUMENT_TYPES)
  type!: DocumentType;

  @IsUUID()
  siteId!: string;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  documentNumber!: string;

  @IsDateString()
  issuedOn!: string;

  @IsOptional()
  @IsIn(STOCK_DIRECTIONS)
  direction?: StockDirection;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @MaxLength(240)
  deliveryAddress?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  type?: DocumentType;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  partnerId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  documentNumber?: string;

  @IsOptional()
  @IsDateString()
  issuedOn?: string;

  @IsOptional()
  @IsIn(STOCK_DIRECTIONS)
  direction?: StockDirection;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @MaxLength(240)
  deliveryAddress?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'REVIEW', 'POSTED', 'CANCELLED'])
  status?: 'DRAFT' | 'REVIEW' | 'POSTED' | 'CANCELLED';

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  type?: DocumentType;
}

export class CreateDocumentLineDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  qty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class UpdateDocumentLineDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  qty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  unitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  discountPercent?: number;

  @IsOptional()
  @Type(() => Number)
  vatRate?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @MaxLength(64)
  batchNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsDateString()
  expiryDate?: string | null;
}
