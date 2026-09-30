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

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsIn(UNITS_OF_MEASURE)
  unit!: UnitOfMeasure;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  packSize?: number;

  /** Net weight/volume of one stock unit (e.g. 400 with unit G for a 400 g cheese pack). */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined || value === null ? null : Number(value)))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  netContent?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined || value === null ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(CONTENT_UNITS)
  netContentUnit?: ContentUnit | null;

  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  purchasePrice!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  sellingPrice!: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minStock?: number;

  /** "Order up to" level used for purchase suggestions. */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : value === null ? null : Number(value)))
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
