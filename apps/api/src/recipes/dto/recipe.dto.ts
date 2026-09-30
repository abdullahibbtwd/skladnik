import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CONTENT_UNITS, MAX_WASTAGE_PERCENT, type ContentUnit } from '@skladnik/shared';

export class RecipeIngredientDto {
  @IsUUID()
  productId!: string;

  /** Net quantity for the whole yield, in `quantityUnit` or the ingredient's stock unit. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(100_000)
  quantity!: number;

  /** G/ML for recipe grammage; omit/null for the product's stock unit. */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined || value === null ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(CONTENT_UNITS)
  quantityUnit?: ContentUnit | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_WASTAGE_PERCENT)
  wastagePercent?: number;
}

export class SaveRecipeDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(10_000)
  yieldPortions!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000)
  markupPercent!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients!: RecipeIngredientDto[];
}

export class RecipeSiteQueryDto {
  @IsUUID()
  siteId!: string;
}
