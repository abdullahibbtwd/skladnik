import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CONTENT_UNITS,
  PRODUCT_STATUSES,
  UNITS_OF_MEASURE,
  type ContentUnit,
  type ProductStatus,
  type UnitOfMeasure,
} from '@skladnik/shared';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsIn(UNITS_OF_MEASURE)
  unit?: UnitOfMeasure;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  packSize?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value === undefined || value === null ? value : Number(value)))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  netContent?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(CONTENT_UNITS)
  netContentUnit?: ContentUnit | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minStock?: number;

  /**
   * SKL-12/18: when set with minStock, writes ProductSiteMin for that site
   * (site managers must supply their own site; company-wide Product.minStock is Owner/Accountant).
   */
  @IsOptional()
  @IsUUID()
  siteId?: string;

  /** null clears it (suggestions then order up to twice the minimum). */
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value === undefined || value === null ? value : Number(value)))
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  maxStock?: number | null;

  @IsOptional()
  @IsBoolean()
  batchTracking?: boolean;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: ProductStatus;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  barcodes?: string[];
}
