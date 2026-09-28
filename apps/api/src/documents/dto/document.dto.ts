import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  DOCUMENT_TYPES,
  PAPER_DOCUMENT_TYPES,
  STOCK_DIRECTIONS,
  WRITE_OFF_REASONS,
  type DocumentType,
  type PaperDocumentType,
  type StockDirection,
  type WriteOffReason,
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

  @IsOptional()
  @IsIn(WRITE_OFF_REASONS)
  writeOffReason?: WriteOffReason;

  /** TRANSFER only: the receiving site. */
  @IsOptional()
  @IsUUID()
  targetSiteId?: string;
}

/** Multipart fields sent with a scanned photo, from the camera or the offline queue. */
export class ScanDocumentDto {
  /** Generated on the device when the photo is taken; a retry with the same key returns the same document. */
  @IsUUID()
  clientRequestId!: string;

  @IsUUID()
  siteId!: string;

  @IsIn(PAPER_DOCUMENT_TYPES)
  type!: PaperDocumentType;

  /** Business day on the device when the photo was taken. */
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issuedOn!: string;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;
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

  /** null turns a write-off back into a plain handover. */
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsIn([...WRITE_OFF_REASONS, null])
  writeOffReason?: WriteOffReason | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUUID()
  targetSiteId?: string | null;
}

export class PostDocumentDto {
  /** Required when the document hands over or moves an expired batch. */
  @IsOptional()
  @IsBoolean()
  confirmExpired?: boolean;
}

export class StocktakeCountDto {
  @IsUUID()
  lineId!: string;

  /** null clears the count (the line is then left unchanged on posting). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQuantity!: number | null;
}

export class StocktakeCountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => StocktakeCountDto)
  counts!: StocktakeCountDto[];
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

  /** STOCKTAKE only; quantity is not used there. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQuantity?: number;
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

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQuantity?: number | null;
}
