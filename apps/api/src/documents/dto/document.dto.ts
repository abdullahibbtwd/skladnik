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
  DOCUMENT_PAYMENT_METHODS,
  DOCUMENT_TYPES,
  PAPER_DOCUMENT_TYPES,
  STOCK_DIRECTIONS,
  UNITS_OF_MEASURE,
  WRITE_OFF_REASONS,
  type UnitOfMeasure,
  type DocumentPaymentMethod,
  type DocumentType,
  type PaperDocumentType,
  type StockDirection,
  type WriteOffReason,
} from '@skladnik/shared';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const MAX_AMOUNT = 9_999_999_999.99;

/** Amounts printed on the paper; null clears one. Negative values are allowed for credit notes. */
class PrintedTotalsDto {
  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-MAX_AMOUNT)
  @Max(MAX_AMOUNT)
  printedTaxableBase?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-MAX_AMOUNT)
  @Max(MAX_AMOUNT)
  printedVatAmount?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-MAX_AMOUNT)
  @Max(MAX_AMOUNT)
  printedTotal?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsIn([...DOCUMENT_PAYMENT_METHODS, null])
  paymentMethod?: DocumentPaymentMethod | null;
}

export function lineQuantity(dto: { quantity?: number; qty?: number }) {
  const value = dto.quantity ?? dto.qty;
  if (value === undefined || Number.isNaN(Number(value))) {
    throw new Error('QUANTITY_REQUIRED');
  }
  return Number(value);
}

export class CreateDocumentDto extends PrintedTotalsDto {
  @IsIn(DOCUMENT_TYPES)
  type!: DocumentType;

  @IsUUID()
  siteId!: string;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /** Left out for documents the company issues itself: the next number of their series is taken. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @MaxLength(64)
  documentNumber?: string;

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

export class UpdateDocumentDto extends PrintedTotalsDto {
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
  /** Required when the document receives, hands over or moves an expired batch. */
  @IsOptional()
  @IsBoolean()
  confirmExpired?: boolean;

  /** Required when the document date is more than DOCUMENT_DATE_MAX_AGE_DAYS in the past. */
  @IsOptional()
  @IsBoolean()
  confirmDate?: boolean;
}

export class ReverseDocumentDto {
  /** Why the posted document is wrong; kept on the reversal and in the activity log. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  /** Required when the document is in a VAT period whose return was already generated. */
  @IsOptional()
  @IsBoolean()
  confirmFiledPeriod?: boolean;
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

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

  /** CAF-01: the stored quantity was checked against the printed cell. */
  @IsOptional()
  @IsBoolean()
  confirmQuantity?: boolean;

  /** CAF-01: accept the product unit for the current quantity. */
  @IsOptional()
  @IsBoolean()
  confirmUnit?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  /** ACC-14: free goods / sample — allows posting with unitPrice 0. */
  @IsOptional()
  @IsBoolean()
  freeOfCharge?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
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

/** "Create product" from an unmatched scanned line; the line is linked to the new product. */
export class CreateProductFromLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  /** Left out to take the next free P-00001 style code. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code?: string;

  /** Required — never default to OTHER from a scan (SKL-03). */
  @IsIn(UNITS_OF_MEASURE)
  unit!: UnitOfMeasure;

  /** Optional. Staff leave it empty; the manager sets the group on approval (CAF-02). */
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate!: number;

  /**
   * Selling price stays empty until set — do not copy the purchase price (SKL-03).
   * Product cannot be sold at the till until this is set.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  sellingPrice?: number | null;

  @IsOptional()
  @IsBoolean()
  batchTracking?: boolean;
}
