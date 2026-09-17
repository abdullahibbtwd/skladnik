import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UNITS_OF_MEASURE, type UnitOfMeasure } from '@skladnik/shared';

export class UpdateUnitAliasDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  raw?: string;

  @IsOptional()
  @IsIn(UNITS_OF_MEASURE)
  unit?: UnitOfMeasure;
}
