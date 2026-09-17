import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { UNITS_OF_MEASURE, type UnitOfMeasure } from '@skladnik/shared';

export class CreateUnitAliasDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  raw!: string;

  @IsIn(UNITS_OF_MEASURE)
  unit!: UnitOfMeasure;
}
